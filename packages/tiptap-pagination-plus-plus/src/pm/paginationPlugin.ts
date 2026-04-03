import { EditorState, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view'
import type { Node as PMNode, NodeType, Attrs } from '@tiptap/pm/model'
import { BreakInfo, PaginationPlusStorage } from '../types'
import { createPageBreakWidget, createSpacerWidget } from './pageBreakWidget'
import { getFirstHeaderWidget } from './firstHeaderWidget'
import { syncCssVars } from '../utils/cssVars'
import { BREAKS_META_KEY, CONFIG_CHANGE_META_KEY, PAGINATION_SPLIT_META_KEY } from '../constants'
import { CSSLength } from '../utils/CSSLength'

// Don't split if less than this many px remain on the page — avoids orphan slivers.
const MIN_SPLIT_HEIGHT = 24

interface PaginationPluginState {
  decorations: DecorationSet
  breaks: BreakInfo[]
  // Positions where we've already applied a pagination split this cycle.
  // If we compute the same split pos again the split didn't reduce the node
  // height (line-boundary snap) → fall back to whole-node break.
  appliedSplitPositions: Set<number>
}

interface SplitInfo {
  pos: number
  depth: number
  typesAfter: { type: NodeType; attrs: Attrs | null }[]
}

const key = new PluginKey<PaginationPluginState>('pagination')

export function getPaginationPlugin(storage: PaginationPlusStorage, initView: EditorView) {
  return new Plugin<PaginationPluginState>({
    key,

    state: {
      init: (_, state) => ({
        decorations: buildDecorations(state, storage, []),
        breaks: [],
        appliedSplitPositions: new Set(),
      }),

      apply: (tr, oldPluginState, _, newState) => {
        if (tr.getMeta(CONFIG_CHANGE_META_KEY)) {
          syncCssVars(initView.dom, storage)
        }

        const newBreaks: BreakInfo[] | undefined = tr.getMeta(BREAKS_META_KEY)
        if (newBreaks !== undefined) {
          return {
            decorations: buildDecorations(newState, storage, newBreaks),
            breaks: newBreaks,
            appliedSplitPositions: new Set(),
          }
        }

        if (tr.docChanged) {
          const isPaginationSplit = tr.getMeta(PAGINATION_SPLIT_META_KEY) === true

          // Carry appliedSplitPositions across pagination splits so the loop
          // guard survives the doc change. Reset on external edits.
          const appliedSplitPositions = isPaginationSplit
            ? oldPluginState.appliedSplitPositions
            : new Set<number>()

          return {
            decorations: buildDecorations(newState, storage, []),
            breaks: [],
            appliedSplitPositions,
          }
        }

        return oldPluginState
      },
    },

    props: {
      decorations(state: EditorState) {
        return this.getState(state)?.decorations
      },
    },

    view: () => {
      // Prevent multiple RAFs from queuing between updates.
      let pendingRaf: ReturnType<typeof requestAnimationFrame> | null = null

      return {
        update: (view: EditorView) => {
          if (pendingRaf !== null) return

          const pluginState = key.getState(view.state)
          const appliedSplits = pluginState?.appliedSplitPositions ?? new Set<number>()

          const { breaks: newBreaks, splits } = computeBreaksAndSplits(
            view,
            storage,
            appliedSplits
          )

          if (splits.length > 0) {
            pendingRaf = requestAnimationFrame(() => {
              pendingRaf = null
              if (view.isDestroyed) return
              const tr = view.state.tr.setMeta(PAGINATION_SPLIT_META_KEY, true)
              // Apply in reverse order so earlier positions stay valid.
              for (const { pos, depth, typesAfter } of [...splits].reverse()) {
                tr.split(pos, depth, typesAfter)
              }
              view.dispatch(tr)
            })
            return
          }

          if (breaksEqual(newBreaks, pluginState?.breaks ?? [])) return

          pendingRaf = requestAnimationFrame(() => {
            pendingRaf = null
            if (!view.isDestroyed) {
              view.dispatch(view.state.tr.setMeta(BREAKS_META_KEY, newBreaks))
            }
          })
        },
      }
    },
  })
}

function buildDecorations(
  state: EditorState,
  storage: PaginationPlusStorage,
  breaks: BreakInfo[]
): DecorationSet {
  const decorations: Decoration[] = [getFirstHeaderWidget(storage)]

  for (const breakInfo of breaks) {
    decorations.push(createSpacerWidget(breakInfo, storage))
    decorations.push(createPageBreakWidget(breakInfo, storage))
  }

  return DecorationSet.create(state.doc, decorations)
}

function computeBreaksAndSplits(
  view: EditorView,
  storage: PaginationPlusStorage,
  appliedSplitPositions: Set<number>
): { breaks: BreakInfo[]; splits: SplitInfo[] } {
  const breaks: BreakInfo[] = []
  const splits: SplitInfo[] = []
  const doc = view.state.doc

  let currentPage = 1
  let accumulatedHeight = 0
  const pageContentHeight = calcPageContentHeight(storage)

  doc.forEach((node, offset) => {
    if (splits.length > 0) return

    const domNode = view.nodeDOM(offset)
    if (!(domNode instanceof HTMLElement)) return

    const nodeHeight = domNode.offsetHeight

    if (accumulatedHeight + nodeHeight > pageContentHeight) {
      const remainingHeight = pageContentHeight - accumulatedHeight

      if (remainingHeight >= MIN_SPLIT_HEIGHT) {
        const split = findSplit(view, node, offset, domNode, remainingHeight, appliedSplitPositions)
        if (split !== null) {
          splits.push(split)
          return
        }
      }

      // No split found (or already tried this pos): break before the whole node.
      // Advance page count by however many full pages the node spans so
      // accumulatedHeight stays correct for subsequent nodes.
      breaks.push({
        pos: offset,
        spacerHeight: Math.max(0, remainingHeight),
        pageNumber: currentPage,
      })
      currentPage += Math.floor(nodeHeight / pageContentHeight) + 1
      accumulatedHeight = nodeHeight % pageContentHeight
    } else {
      accumulatedHeight += nodeHeight
    }
  })

  if (splits.length === 0) {
    breaks.push({
      pos: doc.content.size,
      spacerHeight: Math.max(0, pageContentHeight - accumulatedHeight),
      pageNumber: currentPage,
      isLast: true,
    })
  }

  return { breaks, splits }
}

// ─── Split strategies ────────────────────────────────────────────────────────

function findSplit(
  view: EditorView,
  node: PMNode,
  offset: number,
  domNode: HTMLElement,
  remainingHeight: number,
  appliedSplitPositions: Set<number>
): SplitInfo | null {
  const typeName = node.type.name

  if (typeName === 'paragraph' || typeName === 'blockquote') {
    return findLineBoundSplit(view, node, offset, domNode, remainingHeight, appliedSplitPositions)
  }

  if (typeName === 'table') {
    return findTableSplit(view, node, offset, remainingHeight, appliedSplitPositions)
  }

  return null
}

/**
 * Finds the last line boundary inside `domNode` that fits within `remainingHeight`.
 *
 * Uses DOM Range / getClientRects to walk lines rather than posAtCoords so we
 * always land at a clean line start, never mid-line. This means the first half
 * will always be strictly shorter than the page, avoiding the infinite-loop
 * scenario where posAtCoords snaps to a line boundary and the split produces
 * no height change.
 */
function findLineBoundSplit(
  view: EditorView,
  node: PMNode,
  offset: number,
  domNode: HTMLElement,
  remainingHeight: number,
  appliedSplitPositions: Set<number>
): SplitInfo | null {
  const domRect = domNode.getBoundingClientRect()
  const pageBreakY = domRect.top + remainingHeight

  // Entire node fits or break is above the node — nothing to do.
  if (pageBreakY >= domRect.bottom || pageBreakY <= domRect.top) return null

  const nodeContentStart = offset + 1
  const nodeContentEnd = offset + node.nodeSize - 1

  // Walk the inline content character by character using binary search +
  // DOM Ranges to find the last position whose line box top < pageBreakY.
  const splitPos = findLineSplitPos(view, nodeContentStart, nodeContentEnd, pageBreakY)

  if (splitPos === null) return null

  // Loop guard: if we already split at this pos it didn't help → whole-node break.
  if (appliedSplitPositions.has(splitPos)) return null
  appliedSplitPositions.add(splitPos)

  const $pos = view.state.doc.resolve(splitPos)

  // Ensure we're not at the very start or end of the innermost node's content
  // (would produce an empty paragraph on one side of the split).
  if ($pos.parentOffset === 0 || $pos.parentOffset === $pos.parent.content.size) return null

  const typesAfter = buildTypesAfter($pos)
  return { pos: splitPos, depth: $pos.depth, typesAfter }
}

/**
 * Binary-searches [lo, hi] for the last PM position whose line-top is
 * strictly less than pageBreakY, then binary-searches forward from there
 * to find where the NEXT line begins. Returns that next-line-start as the
 * split position so the first half ends at a clean line boundary.
 *
 * Two binary searches → O(log n) coordsAtPos calls for an n-character node.
 */
function findLineSplitPos(
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

  // Pass 2: find the first position on the line AFTER fittingPos (different line-top).
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

  // Prefer the next-line start (clean boundary). Fall back to fittingPos if the
  // fitting line is the last line of the node (no next line found).
  return nextLineStart ?? fittingPos
}

/** Returns the viewport top of the line containing `pos`, or null. */
function posLineTop(view: EditorView, pos: number): number | null {
  try {
    return view.coordsAtPos(pos).top
  } catch {
    return null
  }
}

/**
 * Finds a split between table rows — never mid-cell.
 * Handles both flat (table > row) and sectioned (table > tbody > row) schemas.
 */
function findTableSplit(
  view: EditorView,
  tableNode: PMNode,
  tableOffset: number,
  remainingHeight: number,
  appliedSplitPositions: Set<number>
): SplitInfo | null {
  let accumulated = 0
  let lastFitPos: number | null = null
  let overflowed = false

  tableNode.forEach((child, childOffset) => {
    if (overflowed) return
    const absChildOffset = tableOffset + 1 + childOffset

    if (child.type.name === 'tableRow') {
      const h = rowHeight(view, absChildOffset)
      if (h === null || accumulated + h > remainingHeight) { overflowed = true; return }
      accumulated += h
      lastFitPos = absChildOffset + child.nodeSize
    } else {
      child.forEach((row, rowOffset) => {
        if (overflowed) return
        const absRowOffset = absChildOffset + 1 + rowOffset
        const h = rowHeight(view, absRowOffset)
        if (h === null || accumulated + h > remainingHeight) { overflowed = true; return }
        accumulated += h
        lastFitPos = absRowOffset + row.nodeSize
      })
    }
  })

  if (lastFitPos === null) return null
  if (appliedSplitPositions.has(lastFitPos)) return null
  appliedSplitPositions.add(lastFitPos)

  const $pos = view.state.doc.resolve(lastFitPos)
  const typesAfter = buildTypesAfter($pos)
  return { pos: lastFitPos, depth: $pos.depth, typesAfter }
}

function rowHeight(view: EditorView, rowOffset: number): number | null {
  const dom = view.nodeDOM(rowOffset)
  if (!(dom instanceof HTMLElement)) return null
  return dom.offsetHeight
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Builds the typesAfter array for tr.split(). Walking from innermost to
 * outermost preserves attrs (alignment etc.) on every split node.
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

// ─── Utility ─────────────────────────────────────────────────────────────────

function calcPageContentHeight(storage: PaginationPlusStorage): number {
  const headerHeight = CSSLength.sum([
    storage.pageMargins.top,
    storage.header.margins.top,
    storage.header.margins.bottom,
  ])
  const footerHeight = CSSLength.sum([
    storage.pageMargins.bottom,
    storage.footer.margins.top,
    storage.footer.margins.bottom,
  ])
  return CSSLength.parse(storage.pageSize.height).sub(headerHeight).sub(footerHeight).toPx()
}

function breaksEqual(a: BreakInfo[], b: BreakInfo[]): boolean {
  if (a.length !== b.length) return false
  return a.every((brk, i) => brk.pos === b[i].pos && brk.spacerHeight === b[i].spacerHeight)
}
