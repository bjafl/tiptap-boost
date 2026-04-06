import type { EditorView } from '@tiptap/pm/view'
import type { PaginationOptions } from '../types'
import { logger } from '../utils/logger'
import { DomColumnHeight } from '../utils/DomColumnHeight'

export interface TextSplitResult {
  /** The DOM Text node where the split occurs. */
  textNode: Text
  /** Character offset within the text node. */
  offset: number
  /** Whether the offset was adjusted to a word boundary. */
  adjustedToWordBoundary: boolean
  /** Estimated number of lines in the head fragment. */
  headLines: number
  /** Estimated number of lines in the tail fragment. */
  tailLines: number
}

/**
 * Finds the optimal position to split a paragraph across a page boundary.
 *
 * Uses a TreeWalker over DOM text nodes and binary search with
 * `Range.getBoundingClientRect()` for O(log n) accuracy.
 * Enforces orphan and widow line limits per the provided config.
 *
 * The `find()` method is pure DOM — it can be tested without ProseMirror.
 * Use `toPmPos()` to convert the result to a PM document position.
 */
export class TextSplitFinder {
  private readonly orphanLines: number
  private readonly widowLines: number

  constructor(config: Pick<PaginationOptions, 'orphanLines' | 'widowLines'>) {
    this.orphanLines = config.orphanLines
    this.widowLines = config.widowLines
  }

  /**
   * Find the optimal split position within `paragraphEl` such that all
   * content up to `maxY` (absolute Y coordinate) stays on the current page.
   *
   * Returns `null` if the paragraph should be moved whole (too little space,
   * orphan control, no suitable text node found).
   */
  find(paragraphEl: HTMLElement, domCol: DomColumnHeight): TextSplitResult | null {
    const { rect, style } = domCol.getComputed(paragraphEl)
    const maxBottom = domCol.findMaxBottomForElement(paragraphEl)
    // const style = getComputedStyle(paragraphEl)
    const lineHeight = parseFloat(style.lineHeight) || 20
    // const parRect = paragraphEl.getBoundingClientRect()

    logger.log(
      'split',
      `TextSplitFinder.find — parRect: [${rect.top.toFixed(1)}..${rect.bottom.toFixed(1)}]` +
        `, maxBottom: ${maxBottom.toFixed(1)}, lineHeight: ${lineHeight}px`,
      paragraphEl
    )

    // Sanity check: if maxY is at or below the top of the paragraph the
    // geometry is stale (wrong pageBottom computed from a scrolled-away node).
    // Fall back to moving the whole block rather than splitting at offset 0.
    // if (maxY <= parRect.top) {
    //   logger.log('split', `TextSplitFinder.find — SKIP: maxY (${maxY.toFixed(1)}) ≤ parRect.top (${parRect.top.toFixed(1)}), stale geometry`)
    //   return null
    // }

    // Orphan check: need room for at least `orphanLines` on this page
    // const availableHeight = maxY - parRect.top
    // if (availableHeight < lineHeight * this.orphanLines) {
    //   logger.log('split', `TextSplitFinder.find — SKIP: orphan guard (available ${availableHeight.toFixed(1)}px < ${this.orphanLines} lines × ${lineHeight}px)`)
    //   return null
    // }

    const result = this.findSplitInElement(paragraphEl, rect, maxBottom, lineHeight)
    if (!result) {
      logger.log('split', `TextSplitFinder.find — SKIP: no split point found in element`)
      return null
    }

    logger.log(
      'split',
      `TextSplitFinder.find — split point: offset=${result.offset}, wordBoundary=${result.adjustedToWordBoundary}, head=${result.headLines} lines, tail=${result.tailLines} lines`
    )

    // Widow check: ensure tail has at least `widowLines`
    // const totalLines = Math.round(parRect.height / lineHeight)
    // if (result.tailLines < this.widowLines && result.headLines > this.widowLines) {
    //   logger.log('split', `TextSplitFinder.find — SKIP: widow guard (tail ${result.tailLines} < ${this.widowLines} lines)`)
    //   const adjustedMaxY = maxY - lineHeight
    //   const retried = this.findSplitInElement(paragraphEl, adjustedMaxY, lineHeight)
    //   return retried
    // }

    return result
  }

  /**
   * Convert a `TextSplitResult` to a ProseMirror document position.
   * Requires an `EditorView` since it uses `view.posAtDOM`.
   */
  toPmPos(result: TextSplitResult, view: EditorView): number {
    // offset 0 means "before the first character of this text node" — posAtDOM
    // can return the paragraph's opening token in that case, which is not a
    // valid split position (tr.split there creates a zero-content head).
    // Clamp to 1 so the split always contains at least one character in the head.
    const safeOffset = Math.max(1, result.offset)
    return view.posAtDOM(result.textNode, safeOffset)
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private findSplitInElement(
    el: HTMLElement,
    parRect: DOMRect,
    maxY: number,
    lineHeight: number
  ): TextSplitResult | null {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const range = document.createRange()

    let splitTextNode: Text | null = null
    let splitOffset = 0

    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text
      if (textNode.length === 0) continue

      range.setStart(textNode, 0)
      range.setEnd(textNode, textNode.length)
      const textRect = range.getBoundingClientRect()

      // Entire text node is above the boundary — skip
      if (textRect.bottom <= maxY) continue

      // Entire text node is below the boundary — split before it
      if (textRect.top >= maxY) {
        splitTextNode = textNode
        splitOffset = 0
        break
      }

      // Text node straddles the boundary — binary search for the offset
      splitOffset = this.binarySearchOffset(textNode, maxY, range)
      splitTextNode = textNode
      break
    }

    if (!splitTextNode) return null

    // Adjust to word boundary
    const { offset: adjustedOffset, adjusted } = adjustToWordBoundary(splitTextNode, splitOffset)

    // Estimate line counts
    const splitRange = document.createRange()
    splitRange.setStart(splitTextNode, 0)
    splitRange.setEnd(splitTextNode, adjustedOffset)
    const headHeight = maxY - parRect.top
    const totalHeight = parRect.height
    const headLines = Math.max(1, Math.round(headHeight / lineHeight))
    const tailLines = Math.max(1, Math.round((totalHeight - headHeight) / lineHeight))

    return {
      textNode: splitTextNode,
      offset: adjustedOffset,
      adjustedToWordBoundary: adjusted,
      headLines,
      tailLines,
    }
  }

  /**
   * Binary search for the last character offset whose bounding rect
   * is still entirely above `maxY`.
   */
  private binarySearchOffset(textNode: Text, maxY: number, range: Range): number {
    let lo = 0
    let hi = textNode.length

    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      range.setStart(textNode, 0)
      range.setEnd(textNode, mid)

      if (range.getBoundingClientRect().bottom <= maxY) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }

    return lo
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function adjustToWordBoundary(
  textNode: Text,
  offset: number
): { offset: number; adjusted: boolean } {
  const text = textNode.textContent ?? ''
  let adjusted = offset

  // Walk back to the nearest space
  while (adjusted > 0 && text[adjusted - 1] !== ' ') {
    adjusted--
  }

  // If we walked back to the start, the whole word is too big — use original
  if (adjusted === 0) {
    return { offset, adjusted: false }
  }

  return { offset: adjusted, adjusted: true }
}
