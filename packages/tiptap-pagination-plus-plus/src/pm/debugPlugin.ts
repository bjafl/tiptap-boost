import { EditorState, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view'
import { BreakInfo, PageDimensions, PaginationPlusStorage } from '../types'
import { CSSLength } from '../utils/CSSLength'
import { DomSizeCalculator } from '../utils/DomSizeCalculator'

const INIT_META = 'dbugPluginInit'
const key = new PluginKey('dbug')

interface DebugPluginState {
  pageDimensions: PageDimensions
  changedRanges: { from: number; to: number }[]
}
export function getDebugPlugin(pageDimensions: PageDimensions): Plugin<DebugPluginState> {
  return new Plugin<DebugPluginState>({
    key,

    state: {
      init: (config, state) => {
        console.log('[DBUG PLUGIN] init', { config, state, pageDimensions })
        return { pageDimensions, changedRanges: [] }
      },

      apply: (tr, prev, oldState, newState) => {
        if (tr.getMeta(INIT_META)) {
          return { ...prev, changedRanges: [{ from: 0, to: newState.doc.content.size }] }
        }
        if (tr.getMeta(key)?.clear) {
          return { ...prev, changedRanges: [] }
        }
        if (!tr.docChanged) {
          return prev // behold akkumulerte ranges
        }

        // Remap tidligere akkumulerte ranges gjennom denne tr
        const remapped = prev.changedRanges.map((r) => ({
          from: tr.mapping.map(r.from),
          to: tr.mapping.map(r.to),
        }))

        // Samle nye ranges fra denne tr
        const newRanges: { from: number; to: number }[] = []
        tr.mapping.maps.forEach((stepMap, i) => {
          stepMap.forEach((oldStart, oldEnd, newStart, newEnd) => {
            const from = tr.mapping.slice(i + 1).map(newStart)
            const to = tr.mapping.slice(i + 1).map(newEnd)
            newRanges.push({ from, to })
          })
        })

        return {
          ...prev,
          changedRanges: mergeRanges([...remapped, ...newRanges]),
        }
      },
    },

    view: (editorView) => {
      document.fonts.ready.then(() => {
        requestAnimationFrame(() => {
          editorView.dispatch(editorView.state.tr.setMeta(INIT_META, true))
        })
      })
      return {
        //PluginView
        update: (view, prevState) => {
          const pluginState = key.getState(view.state)!
          if (!pluginState.changedRanges.length) return

          const changeDomElements: HTMLElement[] = []
          for (const { from, to } of pluginState.changedRanges) {
            view.state.doc.nodesBetween(from, to, (node, pos) => {
              const dom = view.nodeDOM(pos)
              if (dom instanceof HTMLElement) {
                changeDomElements.push(dom)
              }
            })
          }

          //DBUG: calc full doc height
          const docContentElements: HTMLElement[] = []
          view.state.doc.descendants((node, pos) => {
            const dom = view.nodeDOM(pos)
            if (dom instanceof HTMLElement) {
              docContentElements.push(dom)
            }
          })
          const sizer = new DomSizeCalculator(view.dom, 'content')
          const sizes = docContentElements.map((el) => sizer.getRect(el, 'margin', false))
          const totHeightSummed = sizes.reduce((sum, r) => sum + r.height, 0)
          const totHeight = sizer.getHeight(
            docContentElements[0],
            docContentElements[docContentElements.length - 1],
            true
          )
          console.log('[DBUG PLUGIN] view_update', {
            changeDomElements,
            docContentElements,
            sizes,
            totHeightSummed,
            totHeight,
          })

          // Reset changed ranges after processing
          view.dispatch(view.state.tr.setMeta(key, { clear: true }))
        },
        destroy: () => {
          console.log('[DBUG PLUGIN] view_destroy', { viewToplvl: editorView })
        },
      }
    },
  })
}

function mergeRanges(ranges: { from: number; to: number }[]) {
  if (ranges.length < 2) return ranges
  const sorted = ranges.slice().sort((a, b) => a.from - b.from)
  const merged = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1]
    if (sorted[i].from <= prev.to) {
      prev.to = Math.max(prev.to, sorted[i].to)
    } else {
      merged.push(sorted[i])
    }
  }
  return merged
}

function simpleTest(view: EditorView) {
  console.log('[DBUG PLUGIN] view_update', { view })
  const coordsOrigin = view.coordsAtPos(0)
  const posOrigin = view.posAtCoords({ left: 0, top: 0 })
  const state = key.getState(view.state)
  const a4Height = CSSLength.parse(state.pageDimensions.height).toPx()
  const posA4Height = view.posAtCoords({ left: 0, top: a4Height })
  console.log('[DBUG PLUGIN] view_update coords', {
    coordsOrigin,
    posOrigin,
    posA4Height,
  })

  const firstNodePos = 0
  const nodeDom = view.nodeDOM(firstNodePos)

  if (nodeDom && nodeDom.nodeType === Node.ELEMENT_NODE) {
    const domEl = nodeDom as HTMLElement
    const sizer = new DomSizeCalculator(view.dom, 'content')
    const rectRel = sizer.getRect(domEl)
    const rectHeight = sizer.getHeight(domEl)
    console.log('[DBUG PLUGIN] view_update first node rect', { rectRel, rectHeight, domEl })
  }
}
