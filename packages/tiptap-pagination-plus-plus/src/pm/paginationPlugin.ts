import { EditorState, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view'
import { BreakInfo, PaginationPlusStorage } from '../types'
import { createPageBreakWidget, createSpacerWidget } from './pageBreakWidget'
import { getFirstHeaderWidget } from './firstHeaderWidget'
import { syncCssVars } from '../utils/cssVars'
import { BREAKS_META_KEY, CONFIG_CHANGE_META_KEY } from '../constants'

interface PaginationPluginState {
  decorations: DecorationSet
  breaks: BreakInfo[]
}

const key = new PluginKey<PaginationPluginState>('pagination')

export function getPaginationPlugin(storage: PaginationPlusStorage, initView: EditorView) {
  return new Plugin<PaginationPluginState>({
    key,

    state: {
      init: (_, state) => ({
        decorations: buildDecorations(state, storage, []),
        breaks: [],
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
          }
        }

        if (tr.docChanged) {
          return {
            decorations: oldPluginState.decorations.map(tr.mapping, tr.doc),
            breaks: oldPluginState.breaks,
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

    view: () => ({
      update: (view: EditorView) => {
        const newBreaks = computeBreaks(view, storage)
        const pluginState = key.getState(view.state)

        if (breaksEqual(newBreaks, pluginState?.breaks ?? [])) return

        requestAnimationFrame(() => {
          if (!view.isDestroyed) {
            view.dispatch(view.state.tr.setMeta(BREAKS_META_KEY, newBreaks))
          }
        })
      },
    }),
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

function computeBreaks(view: EditorView, storage: PaginationPlusStorage): BreakInfo[] {
  const breaks: BreakInfo[] = []
  const doc = view.state.doc

  let currentPage = 1
  let accumulatedHeight = 0
  let pageContentHeight = calcPageContentHeight(storage)

  doc.forEach((_node, offset) => {
    const domNode = view.nodeDOM(offset)
    if (!(domNode instanceof HTMLElement)) return

    const nodeHeight = domNode.offsetHeight

    if (accumulatedHeight + nodeHeight > pageContentHeight) {
      const spacerHeight = Math.max(0, pageContentHeight - accumulatedHeight)
      breaks.push({ pos: offset, spacerHeight, pageNumber: currentPage })
      currentPage++
      accumulatedHeight = nodeHeight
    } else {
      accumulatedHeight += nodeHeight
    }
  })

  return breaks
}

function calcPageContentHeight(storage: PaginationPlusStorage): number {
  const headerHeight =
    storage.pageMargins.top + storage.header.margins.top + storage.header.margins.bottom
  const footerHeight =
    storage.pageMargins.bottom + storage.footer.margins.top + storage.footer.margins.bottom
  return storage.pageSize.height - headerHeight - footerHeight
}

function breaksEqual(a: BreakInfo[], b: BreakInfo[]): boolean {
  if (a.length !== b.length) return false
  return a.every((brk, i) => brk.pos === b[i].pos && brk.spacerHeight === b[i].spacerHeight)
}
