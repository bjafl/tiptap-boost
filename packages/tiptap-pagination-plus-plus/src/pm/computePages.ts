import { EditorView } from '@tiptap/pm/view'
import { DomColumnHeight } from '../utils/DomColumnHeight'
import { findSplitRequest, type SplitRequest } from './splitStrategies'

/** Don't attempt a split when less than this many px remain — avoids orphan slivers. */
const MIN_SPLIT_HEIGHT = 24

export interface PageInfo {
  startPos: number
  endPos: number
  contentHeight: number
}

export function computePages(
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
      const remaining = pageSize.remaining

      // Try to split the node to fill the remaining space on the current page.
      if (remaining >= MIN_SPLIT_HEIGHT) {
        const split = findSplitRequest(view, node, offset, dom, remaining, appliedSplitPositions)
        if (split !== null) {
          splits.push(split)
          return
        }
      }

      // No split found — close the current page and try placing the whole node on the next.
      pages.push({ startPos: pageStartPos, endPos: offset, contentHeight: pageSize.height })
      pageStartPos = offset
      pageSize = new DomColumnHeight(maxPageContentHeight)

      if (!pageSize.tryAddChild(dom)) {
        // Node is taller than a full page — attempt a split with the full page height.
        const split = findSplitRequest(
          view,
          node,
          offset,
          dom,
          maxPageContentHeight,
          appliedSplitPositions
        )
        if (split !== null) {
          splits.push(split)
          return
        }

        // Unsplittable oversized node — place it alone and let it overflow.
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
    pages.push({ startPos: pageStartPos, endPos: doc.content.size, contentHeight: pageSize.height })
  }

  return { pages, splits }
}
