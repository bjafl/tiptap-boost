import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Node as PMNode } from '@tiptap/pm/model'
import type { PageDimensions } from '../types'
import { DomColumnHeight } from '../utils/DomSizeCalculator'
import { CSSLength } from '../utils/CSSLength'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageInfo {
  startPos: number
  endPos: number
  contentHeight: number
}

interface PluginState {
  pages: PageInfo[]
  /** True when the doc has changed and page layout needs recomputing. */
  dirty: boolean
  decorations: DecorationSet
}

// ─── Meta keys ────────────────────────────────────────────────────────────────

const INIT_META = 'paginationInit'
const PAGES_META = 'paginationPages'

// ─── Plugin key (exported for potential external reads) ────────────────────────

export const paginationPluginKey = new PluginKey<PluginState>('pagination')

// ─── Plugin factory ───────────────────────────────────────────────────────────

export function getPaginationPlugin(pageDimensions: PageDimensions): Plugin<PluginState> {
  const maxPageContentHeight =
    CSSLength.parse(pageDimensions.height).toPx() -
    CSSLength.parseSum(pageDimensions.margin.top, pageDimensions.margin.bottom)

  return new Plugin<PluginState>({
    key: paginationPluginKey,

    state: {
      init: (_config, _state) => ({
        pages: [],
        dirty: false,
        decorations: DecorationSet.empty,
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
          }
        }

        if (!tr.docChanged) return prev

        return {
          pages: prev.pages,
          dirty: true,
          decorations: prev.decorations.map(tr.mapping, tr.doc),
        }
      },
    },

    props: {
      decorations(state) {
        return paginationPluginKey.getState(state)?.decorations
      },
    },

    view: (editorView) => {
      // Trigger initial layout after fonts are loaded.
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
          if (!pluginState?.dirty) return
          if (pendingRaf !== null) return

          pendingRaf = requestAnimationFrame(() => {
            pendingRaf = null
            if (view.isDestroyed) return

            const pages = computePages(view.state.doc, view, maxPageContentHeight)
            const current = paginationPluginKey.getState(view.state)?.pages ?? []
            if (!pagesEqual(pages, current)) {
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
  doc: PMNode,
  view: { nodeDOM(pos: number): Node | null | undefined },
  maxPageContentHeight: number
): PageInfo[] {
  const pages: PageInfo[] = []
  let pageSize = new DomColumnHeight(maxPageContentHeight)
  let pageStartPos = 0

  doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset)
    if (!(dom instanceof HTMLElement)) return

    if (!pageSize.tryAddChild(dom)) {
      // Node doesn't fit: close current page and start a new one.
      pages.push({ startPos: pageStartPos, endPos: offset, contentHeight: pageSize.height })
      pageStartPos = offset
      pageSize = new DomColumnHeight(maxPageContentHeight)

      if (!pageSize.tryAddChild(dom)) {
        // Node exceeds a full page height — place it alone and continue.
        pages.push({
          startPos: offset,
          endPos: offset + node.nodeSize,
          contentHeight: pageSize.height,
        })
        pageStartPos = offset + node.nodeSize
        pageSize = new DomColumnHeight(maxPageContentHeight)
        return
      }
    }
  })

  // Final (last) page.
  pages.push({
    startPos: pageStartPos,
    endPos: doc.content.size,
    contentHeight: pageSize.height,
  })

  return pages
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pagesEqual(a: PageInfo[], b: PageInfo[]): boolean {
  if (a.length !== b.length) return false
  return a.every(
    (p, i) => p.startPos === b[i].startPos && p.endPos === b[i].endPos && p.contentHeight === b[i].contentHeight
  )
}

// ─── Decoration builders ──────────────────────────────────────────────────────

function buildDecorations(pages: PageInfo[], maxPageContentHeight: number): Decoration[] {
  // [firstBreakInfo sentinel, ...pages] — index 0 renders only the first-page header,
  // indices 1..pages.length-1 render footer+gap+header, index pages.length renders only footer.
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
    const remaining = maxPageContentHeight - page.contentHeight
    const spacer = document.createElement('div')
    spacer.className = 'ttb-page-spacer'
    spacer.style.height = `${remaining}px`
    el.appendChild(spacer)

    const footer = document.createElement('div')
    footer.className = 'ttb-page-footer'
    footer.style.height = '25mm' // TODO: use storage
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
    header.style.height = '25mm' // TODO: use storage
    el.appendChild(header)
  }

  return el
}
