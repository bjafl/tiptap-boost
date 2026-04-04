import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DecorationSet } from '@tiptap/pm/view'
import type { PageDimensions } from '../types'
import { CSSLength } from '../utils/CSSLength'
import { computePages, type PageInfo } from './computePages'
import { buildDecorations } from './pageBreakDecos'

// ─── State ────────────────────────────────────────────────────────────────────

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

// ─── Factory ─────────────────────────────────────────────────────────────────

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
            decorations: DecorationSet.create(newState.doc, buildDecorations(newPages, maxPageContentHeight)),
            appliedSplitPositions: new Set(),
          }
        }

        if (!tr.docChanged) return prev

        return {
          pages: prev.pages,
          dirty: true,
          decorations: prev.decorations.map(tr.mapping, tr.doc),
          // Carry applied splits across pagination splits so the anti-oscillation
          // guard survives the doc change. Reset on any external edit.
          appliedSplitPositions: tr.getMeta(SPLIT_META) === true
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

            const { pages, splits } = computePages(view, maxPageContentHeight, state.appliedSplitPositions)

            if (splits.length > 0) {
              const tr = view.state.tr.setMeta(SPLIT_META, true)
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

// ─── Utility ─────────────────────────────────────────────────────────────────

function pagesEqual(a: PageInfo[], b: PageInfo[]): boolean {
  if (a.length !== b.length) return false
  return a.every(
    (p, i) => p.startPos === b[i].startPos && p.endPos === b[i].endPos && p.contentHeight === b[i].contentHeight
  )
}
