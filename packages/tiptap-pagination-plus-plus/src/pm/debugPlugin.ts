import { Plugin, PluginKey } from '@tiptap/pm/state'
import { PageDimensions } from '../types'
import { DomColumnHeight, DomSizeCalculator } from '../utils/DomColumnHeight'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { CSSLength } from '../utils/CSSLength'
import { Node as PMNode } from '@tiptap/pm/model'
interface PageInfo {
  // Posisjoner i gjeldende doc
  startPos: number
  endPos: number
  // Cached høyde
  contentHeight: number
}
interface NodeRange {
  from: number
  to: number
  pageNumber?: number
}

interface DebugPluginState {
  pages: PageInfo[]
  changedRanges: { from: number; to: number }[]
  decorations: DecorationSet
}

const INIT_META = 'dbugPluginInit'
const key = new PluginKey<DebugPluginState>('dbug')

export function getDebugPlugin(pageDimensions: PageDimensions): Plugin<DebugPluginState> {
  const maxPageContentHeight = //TODO: dynamic update on storage change
    CSSLength.parse(pageDimensions.height).toPx() -
    CSSLength.parseSum(pageDimensions.margin.top, pageDimensions.margin.bottom)
  return new Plugin<DebugPluginState>({
    key,

    state: {
      init: (config, state) => {
        return { pages: [], changedRanges: [], decorations: DecorationSet.empty }
      },

      apply: (tr, prev, oldState, newState) => {
        if (tr.getMeta(INIT_META)) {
          return { ...prev, changedRanges: [{ from: 0, to: newState.doc.content.size }] }
        }
        if (tr.getMeta(key)?.pages) {
          const newPgs = tr.getMeta(key).pages as PageInfo[]
          console.log('[DBUG PLUGIN] apply, got new page infos:', newPgs)
          const decorations = DecorationSet.create(
            newState.doc,
            createBreakerDecos(newPgs, maxPageContentHeight)
          )
          return { pages: newPgs, changedRanges: [], decorations }
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
        console.log('[DBUG PLUGIN] tr:', tr)
        const newRanges: { from: number; to: number }[] = []
        tr.mapping.maps.forEach((stepMap, i) => {
          stepMap.forEach((oldStart, oldEnd, newStart, newEnd) => {
            const from = tr.mapping.slice(i + 1).map(newStart)
            const to = tr.mapping.slice(i + 1).map(newEnd)
            newRanges.push({ from, to })
          })
        })

        return {
          pages: prev.pages,
          decorations: prev.decorations.map(tr.mapping, tr.doc),
          changedRanges: mergeRanges([...remapped, ...newRanges]),
        }
      },
    },
    props: {
      decorations(state) {
        return key.getState(state)?.decorations
      },
    },
    view: (editorView) => {
      document.fonts.ready.then(() => {
        requestAnimationFrame(() => {
          editorView.dispatch(editorView.state.tr.setMeta(INIT_META, true))
        })
      })

      // const sizeCalc = new DomSizeCalculator(editorView.dom, 'content')

      return {
        //PluginView
        update: (view, prevState) => {
          const { changedRanges, pages } = key.getState(view.state)!
          if (!changedRanges.length) return
          // const nodePositions: number[] = []
          // view.state.doc.forEach((node, offset) => {
          //   nodePositions.push(offset)
          // })
          const firstNodeChangedPos = Math.min(...changedRanges.map((r) => r.from))
          const lastNodeChangedPos = Math.max(...changedRanges.map((r) => r.from))
          type NodeInfo = { dom: HTMLElement; pos: number; node: PMNode }
          const changedNodes: NodeInfo[] = []
          const trailingNodes: NodeInfo[] = []
          view.state.doc.nodesBetween(
            // firstNodeChangedPos, // Todo: optimize - start from prev page break.
            0,
            view.state.doc.content.size,
            (node, pos) => {
              const dom = view.nodeDOM(pos)
              if (dom && dom.nodeType === Node.ELEMENT_NODE) {
                if (pos > lastNodeChangedPos) {
                  trailingNodes.push({ dom: dom as HTMLElement, pos, node })
                } else {
                  changedNodes.push({ dom: dom as HTMLElement, pos, node })
                }
              }
            }
          )
          const nodes = [...changedNodes, ...trailingNodes] //todo: optimize, stop once rest of doc doesn't need reflow

          console.log('[DBUG PLUGIN] view_update, changed ranges:', {
            firstNodeChangedPos,
            lastNodeChangedPos,
            changedRanges,
            pages,
            changedNodes,
            trailingNodes,
            nodes,
            maxPageContentHeight,
            doc: view.state.doc,
          })

          const newPageInfos: PageInfo[] = []
          for (let i = 0; i < nodes.length; i++) {
            const curNode = nodes[i]

            const curPageInfo: PageInfo = {
              startPos: curNode.pos,
              endPos: -1,
              contentHeight: 0,
            }
            const pageSize = new DomColumnHeight(maxPageContentHeight)
            let endNodeIdx = i
            while (pageSize.tryAddChild(nodes[endNodeIdx].dom)) {
              curPageInfo.contentHeight = pageSize.height
              endNodeIdx++
              if (endNodeIdx >= nodes.length) {
                break
              }
            }
            if (endNodeIdx === i) {
              // Single node exceeds page height
              //TODO split...
              console.warn(
                `[DBUG PLUGIN] Node at pos ${curNode.pos} exceeds max page content height. Content will overflow`
              )
              curPageInfo.contentHeight = pageSize.height // overflowing height ...
              curPageInfo.endPos = curNode.pos + curNode.node.nodeSize
              // i stays at i, i++ advances to next node
            } else {
              const lastFit = nodes[endNodeIdx - 1]
              curPageInfo.endPos = lastFit.pos + lastFit.node.nodeSize
              i = endNodeIdx - 1 // i++ will land on endNodeIdx (first node of next page)
            }

            console.log(
              '[DBUG PLUGIN] determined page break at pos:',
              curPageInfo.startPos,
              'with content height:',
              curPageInfo.contentHeight,
              'ending at pos:',
              curPageInfo.endPos
            )
            newPageInfos.push(curPageInfo)
          }

          console.log('[DBUG PLUGIN] dispatching new page infos:', newPageInfos)

          requestAnimationFrame(() => {
            if (!view.isDestroyed) {
              view.dispatch(view.state.tr.setMeta(key, { pages: newPageInfos }))
            }
          })
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

function createBreakerDecos(pages: PageInfo[], maxPageContentHeight: number) {
  const firstBreakInfo = {
    startPos: 0,
    endPos: 0,
    contentHeight: 0,
  }
  return [firstBreakInfo, ...pages].map((page, idx) =>
    Decoration.widget(
      page.endPos,
      () => {
        console.log(
          '[DBUG PLUGIN] creating breaker deco for page starting at pos:',
          page.startPos,
          {
            page,
            maxPageContentHeight,
            remainingHeight: maxPageContentHeight - page.contentHeight,
          }
        )
        const el = document.createElement('div')
        el.className = 'ttb-page-break'
        if (idx !== 0) {
          const spacer = document.createElement('div')
          const remainingHeight = maxPageContentHeight - page.contentHeight
          spacer.className = 'ttb-page-spacer'
          spacer.style.height = `${remainingHeight}px`
          el.appendChild(spacer)
          const footer = document.createElement('div')
          footer.className = 'ttb-page-footer'
          footer.style.height = '25mm' //TODO
          el.appendChild(footer)
        }
        if (idx !== 0 && idx !== pages.length) {
          const gap = document.createElement('div')
          gap.className = 'ttb-pagination-gap'
          el.appendChild(gap)
        }

        if (idx !== pages.length) {
          const nextHeader = document.createElement('div')
          nextHeader.className = 'ttb-page-header'
          nextHeader.style.height = '25mm' //TODO
          el.appendChild(nextHeader)
        }
        return el
      },
      { side: 0 }
    )
  )
}
