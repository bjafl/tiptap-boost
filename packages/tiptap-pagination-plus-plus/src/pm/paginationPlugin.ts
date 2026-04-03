import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view'
import { Node as PMNode, NodeType } from '@tiptap/pm/model'
import type { Attrs } from '@tiptap/pm/model'
import type { PageDimensions } from '../types'
import { DomColumnHeight } from '../utils/DomSizeCalculator'
import { CSSLength } from '../utils/CSSLength'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Don't attempt a split when less than this many px remain — avoids orphan slivers. */
const MIN_SPLIT_HEIGHT = 24

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageInfo {
  startPos: number
  endPos: number
  contentHeight: number
}

interface SplitRequest {
  pos: number
  depth: number
  typesAfter: { type: NodeType; attrs: Attrs | null }[]
}

interface PluginState {
  pages: PageInfo[]
  dirty: boolean
  decorations: DecorationSet
  /**
   * Positions where a split has already been applied this cycle.
   * Prevents oscillation when a split doesn't reduce node height enough
   * to avoid re-triggering the same split.
   */
  appliedSplitPositions: Set<number>
}

// ─── Meta keys ────────────────────────────────────────────────────────────────

const INIT_META = 'paginationInit'
const PAGES_META = 'paginationPages'
const SPLIT_META = 'paginationSplit'

// ─── Plugin key ───────────────────────────────────────────────────────────────

export const paginationPluginKey = new PluginKey<PluginState>('pagination')

// ─── Plugin factory ───────────────────────────────────────────────────────────

export function getPaginationPlugin(pageDimensions: PageDimensions): Plugin<PluginState> {
  const maxPageContentHeight =
    CSSLength.parse(pageDimensions.height).toPx() -
    CSSLength.parseSum(pageDimensions.margin.top, pageDimensions.margin.bottom)

  return new Plugin<PluginState>({
    key: paginationPluginKey,

    state: {
      init: () => ({
        pages: [],
        dirty: false,
        decorations: DecorationSet.empty,
        appliedSplitPositions: new Set(),
      }),

      apply: (tr, prev, _oldState, newState) => {
        if (tr.getMeta(INIT_META)) {
          return { ...prev, dirty: true }
        }

        const newPages: PageInfo[] | undefined = tr.getMeta(PAGES_META)
        if (newPages !== undefined) {
          return {
            pages: newPages,
            dirty: false,
            decorations: DecorationSet.create(
              newState.doc,
              buildDecorations(newPages, maxPageContentHeight)
            ),
            appliedSplitPositions: new Set(),
          }
        }

        if (!tr.docChanged) return prev

        const isPaginationSplit = tr.getMeta(SPLIT_META) === true
        return {
          pages: prev.pages,
          dirty: true,
          decorations: prev.decorations.map(tr.mapping, tr.doc),
          // Carry applied splits across pagination splits so the anti-oscillation
          // guard survives the doc change. Reset on any external edit.
          appliedSplitPositions: isPaginationSplit
            ? prev.appliedSplitPositions
            : new Set(),
        }
      },
    },

    props: {
      decorations(state) {
        return paginationPluginKey.getState(state)?.decorations
      },
    },

    view: (editorView) => {
      document.fonts.ready.then(() => {
        requestAnimationFrame(() => {
          if (!editorView.isDestroyed) {
            editorView.dispatch(editorView.state.tr.setMeta(INIT_META, true))
          }
        })
      })

      let pendingRaf: ReturnType<typeof requestAnimationFrame> | null = null

      return {
        update: (view) => {
          const pluginState = paginationPluginKey.getState(view.state)
          if (!pluginState?.dirty || pendingRaf !== null) return

          pendingRaf = requestAnimationFrame(() => {
            pendingRaf = null
            if (view.isDestroyed) return

            // Re-read state inside the RAF — it may have changed since scheduling.
            const state = paginationPluginKey.getState(view.state)
            if (!state?.dirty) return

            const { pages, splits } = computePages(
              view,
              maxPageContentHeight,
              state.appliedSplitPositions
            )

            if (splits.length > 0) {
              const tr = view.state.tr.setMeta(SPLIT_META, true)
              // Apply in reverse order so earlier positions stay valid.
              for (const { pos, depth, typesAfter } of [...splits].reverse()) {
                tr.split(pos, depth, typesAfter)
              }
              view.dispatch(tr)
              return
            }

            if (!pagesEqual(pages, state.pages)) {
              view.dispatch(view.state.tr.setMeta(PAGES_META, pages))
            }
          })
        },
      }
    },
  })
}

// ─── Page layout computation ──────────────────────────────────────────────────

function computePages(
  view: EditorView,
  maxPageContentHeight: number,
  appliedSplitPositions: Set<number>
): { pages: PageInfo[]; splits: SplitRequest[] } {
  const doc = view.state.doc
  const pages: PageInfo[] = []
  const splits: SplitRequest[] = []
  let pageSize = new DomColumnHeight(maxPageContentHeight)
  let pageStartPos = 0

  doc.forEach((node, offset) => {
    if (splits.length > 0) return

    const dom = view.nodeDOM(offset)
    if (!(dom instanceof HTMLElement)) return

    if (!pageSize.tryAddChild(dom)) {
      const remainingHeight = pageSize.remaining

      // Attempt to split the node to use the remaining space on the current page.
      if (remainingHeight >= MIN_SPLIT_HEIGHT) {
        const split = findSplitRequest(
          view, node, offset, dom, remainingHeight, appliedSplitPositions
        )
        if (split !== null) {
          splits.push(split)
          return
        }
      }

      // No split — close the current page and move the whole node to the next.
      pages.push({ startPos: pageStartPos, endPos: offset, contentHeight: pageSize.height })
      pageStartPos = offset
      pageSize = new DomColumnHeight(maxPageContentHeight)

      if (!pageSize.tryAddChild(dom)) {
        // Node is taller than a full page — try to split it.
        const split = findSplitRequest(
          view, node, offset, dom, maxPageContentHeight, appliedSplitPositions
        )
        if (split !== null) {
          splits.push(split)
          return
        }
        // Can't split — place it alone and let it overflow.
        pages.push({
          startPos: offset,
          endPos: offset + node.nodeSize,
          contentHeight: pageSize.height,
        })
        pageStartPos = offset + node.nodeSize
        pageSize = new DomColumnHeight(maxPageContentHeight)
      }
    }
  })

  if (splits.length === 0) {
    pages.push({
      startPos: pageStartPos,
      endPos: doc.content.size,
      contentHeight: pageSize.height,
    })
  }

  return { pages, splits }
}

// ─── Split dispatch ───────────────────────────────────────────────────────────

/**
 * Returns a split request for splittable node types, or null if the node
 * cannot or should not be split.
 */
function findSplitRequest(
  view: EditorView,
  node: PMNode,
  offset: number,
  dom: HTMLElement,
  remainingHeight: number,
  appliedSplitPositions: Set<number>
): SplitRequest | null {
  switch (node.type.name) {
    case 'paragraph':
    case 'heading':
    case 'blockquote':
      return findTextSplit(view, node, offset, dom, remainingHeight, appliedSplitPositions)

    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return findListSplit(view, node, offset, remainingHeight, appliedSplitPositions)

    case 'table':
      return findTableSplit(view, node, offset, remainingHeight, appliedSplitPositions)

    default:
      return null
  }
}

// ─── Text / paragraph split ───────────────────────────────────────────────────

/**
 * Splits a paragraph/heading/blockquote at a line boundary that fits within
 * `remainingHeight`. Uses coordsAtPos binary search so the split always lands
 * at a clean line start, never mid-word.
 */
function findTextSplit(
  view: EditorView,
  node: PMNode,
  offset: number,
  dom: HTMLElement,
  remainingHeight: number,
  appliedSplitPositions: Set<number>
): SplitRequest | null {
  const domRect = dom.getBoundingClientRect()
  const pageBreakY = domRect.top + remainingHeight

  if (pageBreakY >= domRect.bottom || pageBreakY <= domRect.top) return null

  const contentStart = offset + 1
  const contentEnd = offset + node.nodeSize - 1

  const splitPos = findLineBoundary(view, contentStart, contentEnd, pageBreakY)
  if (splitPos === null) return null
  if (appliedSplitPositions.has(splitPos)) return null
  appliedSplitPositions.add(splitPos)

  const $pos = view.state.doc.resolve(splitPos)
  if ($pos.parentOffset === 0 || $pos.parentOffset === $pos.parent.content.size) return null

  return { pos: splitPos, depth: $pos.depth, typesAfter: buildTypesAfter($pos) }
}

/**
 * Binary-searches [lo, hi] for the last PM position whose line-top is
 * strictly less than `pageBreakY`, then finds where the next line begins.
 * Returns the next-line start as the split position so the first half ends
 * at a clean line boundary.
 */
function findLineBoundary(
  view: EditorView,
  lo: number,
  hi: number,
  pageBreakY: number
): number | null {
  // Pass 1: find the rightmost position on a fitting line.
  let fittingPos: number | null = null
  let searchLo = lo
  let searchHi = hi

  while (searchLo <= searchHi) {
    const mid = (searchLo + searchHi) >> 1
    const y = posLineTop(view, mid)
    if (y === null) { searchLo = mid + 1; continue }

    if (y < pageBreakY) {
      fittingPos = mid
      searchLo = mid + 1
    } else {
      searchHi = mid - 1
    }
  }

  if (fittingPos === null) return null

  const fittingLineTop = posLineTop(view, fittingPos)
  if (fittingLineTop === null) return null

  // Pass 2: find the first position on the line AFTER fittingPos.
  searchLo = fittingPos + 1
  searchHi = hi
  let nextLineStart: number | null = null

  while (searchLo <= searchHi) {
    const mid = (searchLo + searchHi) >> 1
    const y = posLineTop(view, mid)
    if (y === null) { searchLo = mid + 1; continue }

    if (y > fittingLineTop) {
      nextLineStart = mid
      searchHi = mid - 1
    } else {
      searchLo = mid + 1
    }
  }

  // Prefer the clean next-line start. Fall back to fittingPos only if the
  // fitting line is the last line of the node (no next line exists).
  return nextLineStart ?? fittingPos
}

function posLineTop(view: EditorView, pos: number): number | null {
  try {
    return view.coordsAtPos(pos).top
  } catch {
    return null
  }
}

// ─── List split ───────────────────────────────────────────────────────────────

/**
 * Splits a list between list items — never inside an item.
 */
function findListSplit(
  view: EditorView,
  listNode: PMNode,
  listOffset: number,
  remainingHeight: number,
  appliedSplitPositions: Set<number>
): SplitRequest | null {
  const listHeight = new DomColumnHeight(remainingHeight)
  let lastFitPos: number | null = null
  let overflowed = false

  listNode.forEach((listItem, itemOffset) => {
    if (overflowed) return
    const absItemOffset = listOffset + 1 + itemOffset
    const itemDom = view.nodeDOM(absItemOffset)
    if (!(itemDom instanceof HTMLElement)) { overflowed = true; return }

    if (!listHeight.tryAddChild(itemDom)) {
      overflowed = true
      return
    }
    lastFitPos = absItemOffset + listItem.nodeSize
  })

  if (lastFitPos === null) return null
  if (appliedSplitPositions.has(lastFitPos)) return null
  appliedSplitPositions.add(lastFitPos)

  const $pos = view.state.doc.resolve(lastFitPos)
  return { pos: lastFitPos, depth: $pos.depth, typesAfter: buildTypesAfter($pos) }
}

// ─── Table split ─────────────────────────────────────────────────────────────

/**
 * Splits a table between rows — never mid-cell.
 * Handles both flat (table > row) and sectioned (table > tbody > row) schemas.
 */
function findTableSplit(
  view: EditorView,
  tableNode: PMNode,
  tableOffset: number,
  remainingHeight: number,
  appliedSplitPositions: Set<number>
): SplitRequest | null {
  const tableHeight = new DomColumnHeight(remainingHeight)
  let lastFitPos: number | null = null
  let overflowed = false

  tableNode.forEach((child, childOffset) => {
    if (overflowed) return
    const absChildOffset = tableOffset + 1 + childOffset

    if (child.type.name === 'tableRow') {
      const rowDom = view.nodeDOM(absChildOffset)
      if (!(rowDom instanceof HTMLElement)) { overflowed = true; return }
      if (!tableHeight.tryAddChild(rowDom)) { overflowed = true; return }
      lastFitPos = absChildOffset + child.nodeSize
    } else {
      // Table section (thead, tbody, tfoot)
      child.forEach((row, rowOffset) => {
        if (overflowed) return
        const absRowOffset = absChildOffset + 1 + rowOffset
        const rowDom = view.nodeDOM(absRowOffset)
        if (!(rowDom instanceof HTMLElement)) { overflowed = true; return }
        if (!tableHeight.tryAddChild(rowDom)) { overflowed = true; return }
        lastFitPos = absRowOffset + row.nodeSize
      })
    }
  })

  if (lastFitPos === null) return null
  if (appliedSplitPositions.has(lastFitPos)) return null
  appliedSplitPositions.add(lastFitPos)

  const $pos = view.state.doc.resolve(lastFitPos)
  return { pos: lastFitPos, depth: $pos.depth, typesAfter: buildTypesAfter($pos) }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Builds the typesAfter array for tr.split(), walking from innermost to
 * outermost to preserve attrs (alignment, list type, etc.) on every new node.
 */
function buildTypesAfter(
  $pos: ReturnType<typeof import('@tiptap/pm/model').Node.prototype.resolve>
): { type: NodeType; attrs: Attrs | null }[] {
  const typesAfter: { type: NodeType; attrs: Attrs | null }[] = []
  for (let d = $pos.depth; d > 0; d--) {
    const ancestor = $pos.node(d)
    typesAfter.push({ type: ancestor.type, attrs: ancestor.attrs })
  }
  return typesAfter
}

// ─── Decoration builders ──────────────────────────────────────────────────────

function buildDecorations(pages: PageInfo[], maxPageContentHeight: number): Decoration[] {
  // [sentinel, ...pages]:
  //   idx 0          → first-page header only
  //   idx 1..n-1     → footer + gap + header
  //   idx n          → last-page footer only
  const sentinel = { startPos: 0, endPos: 0, contentHeight: 0 }
  const all = [sentinel, ...pages]

  return all.map((page, idx) =>
    Decoration.widget(
      page.endPos,
      () => createBreakElement(page, idx, pages.length, maxPageContentHeight),
      { side: 0 }
    )
  )
}

function createBreakElement(
  page: PageInfo,
  idx: number,
  totalPages: number,
  maxPageContentHeight: number
): HTMLElement {
  const el = document.createElement('div')
  el.className = 'ttb-page-break'

  if (idx !== 0) {
    const spacer = document.createElement('div')
    spacer.className = 'ttb-page-spacer'
    spacer.style.height = `${maxPageContentHeight - page.contentHeight}px`
    el.appendChild(spacer)

    const footer = document.createElement('div')
    footer.className = 'ttb-page-footer'
    footer.style.height = '25mm' // TODO: drive from storage
    el.appendChild(footer)
  }

  if (idx !== 0 && idx !== totalPages) {
    const gap = document.createElement('div')
    gap.className = 'ttb-pagination-gap'
    el.appendChild(gap)
  }

  if (idx !== totalPages) {
    const header = document.createElement('div')
    header.className = 'ttb-page-header'
    header.style.height = '25mm' // TODO: drive from storage
    el.appendChild(header)
  }

  return el
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function pagesEqual(a: PageInfo[], b: PageInfo[]): boolean {
  if (a.length !== b.length) return false
  return a.every(
    (p, i) =>
      p.startPos === b[i].startPos &&
      p.endPos === b[i].endPos &&
      p.contentHeight === b[i].contentHeight
  )
}
