import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { PaginationPlusStorage } from '../types'
import {
  ReplaceStep,
  ReplaceAroundStep,
  AddMarkStep,
  RemoveMarkStep,
  RemoveNodeMarkStep,
  AttrStep,
} from '@tiptap/pm/transform'

const key = new PluginKey<DecorationSet>('brDecoration')
export function getBreakDecoPlugin(storage: PaginationPlusStorage) {
  return new Plugin<DecorationSet>({
    key: new PluginKey<DecorationSet>('brDecoration'),

    state: {
      init(config, state) {
        return buildDecorations(state.doc, storage)
      },

      apply(tr, old) {
        if (
          tr.docChanged ||
          tr.steps.some((step) => step instanceof ReplaceStep) ||
          tr.steps.some((step) => step instanceof ReplaceAroundStep) ||
          tr.steps.some((step) => step instanceof AddMarkStep) ||
          tr.steps.some((step) => step instanceof RemoveMarkStep) ||
          tr.steps.some((step) => step instanceof RemoveNodeMarkStep) ||
          tr.steps.some((step) => step instanceof AttrStep)
        ) {
          return buildDecorations(tr.doc, storage)
        }
        return old
      },
    },

    props: {
      decorations(state) {
        return key.getState(state) ?? DecorationSet.empty
      },
    },
  })
}

//TODO: Check...
function buildDecorations(doc: PMNode, storage: PaginationPlusStorage): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (node.type.name === 'hardBreak') {
      const afterPos = pos + 1
      const widget = Decoration.widget(afterPos, () => {
        const el = document.createElement('span')
        el.classList.add(`${storage.cssClassPrefix}-br-decoration`)
        return el
      })
      decorations.push(widget)
    }
  })
  return DecorationSet.create(doc, decorations)
}
