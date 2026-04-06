import type { Node as PMNode } from '@tiptap/pm/model'
import type { Mapping } from '@tiptap/pm/transform'
import type { Transaction } from '@tiptap/pm/state'
import type { PageEntry } from '../types'
import { DomColumnHeight } from '../utils/DomColumnHeight'
import type { PageGeometry } from '../utils/PageGeometry'
import { logger } from '../utils/logger'

export type { PageEntry }

/**
 * Tracks virtual page boundaries as PM document positions.
 *
 * The PM document is flat — no page nodes. `PageMap` is the sole source of
 * truth for which positions belong to which page.
 *
 * Positions:
 *   - `startPos` is inclusive (first position on the page).
 *   - `endPos` is exclusive (first position on the NEXT page / end of doc).
 */
export class PageMap {
  private pages: PageEntry[] = []
  private dirty: Set<number> = new Set()

  // ── Read ───────────────────────────────────────────────────────────────────

  get length(): number {
    return this.pages.length
  }

  getPage(pageIndex: number): PageEntry | null {
    return this.pages[pageIndex] ?? null
  }

  allPages(): readonly PageEntry[] {
    return this.pages
  }

  /**
   * Find the page that contains `pos`. Binary search — O(log n).
   */
  pageForPos(pos: number): PageEntry | null {
    const idx = this.pageIndexForPos(pos)
    return idx === -1 ? null : this.pages[idx]
  }

  pageIndexForPos(pos: number): number {
    let lo = 0
    let hi = this.pages.length - 1

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      const page = this.pages[mid]

      if (pos < page.startPos) {
        hi = mid - 1
      } else if (pos >= page.endPos) {
        lo = mid + 1
      } else {
        return mid
      }
    }

    // Clamp to last page if pos is at or beyond endPos of last page
    if (this.pages.length > 0 && pos >= this.pages[this.pages.length - 1].startPos) {
      return this.pages.length - 1
    }

    return -1
  }

  // ── Mutate ─────────────────────────────────────────────────────────────────

  /**
   * Move the boundary between `pageIndex` and `pageIndex + 1`.
   * `newEndPos` becomes the new `endPos` of page `pageIndex` and the new
   * `startPos` of page `pageIndex + 1`.
   */
  setSplitBoundary(pageIndex: number, newEndPos: number): void {
    const page = this.pages[pageIndex]
    const next = this.pages[pageIndex + 1]

    if (!page) return

    logger.log(
      'pagemap',
      `setSplitBoundary: page ${pageIndex} endPos ${page.endPos} → ${newEndPos}`
    )

    if (next) {
      page.endPos = newEndPos
      next.startPos = newEndPos
    } else {
      this.splitLastPage(newEndPos)
    }

    this.markDirty(pageIndex)
    if (next) this.markDirty(pageIndex + 1)
  }

  /**
   * Insert a new page after `afterIndex`.
   */
  insertPageAfter(afterIndex: number, startPos: number, endPos: number): void {
    const newIndex = afterIndex + 1
    const entry: PageEntry = { pageIndex: newIndex, startPos, endPos }

    this.pages.splice(newIndex, 0, entry)

    for (let i = newIndex + 1; i < this.pages.length; i++) {
      this.pages[i].pageIndex = i
    }

    logger.log(
      'pagemap',
      `insertPageAfter ${afterIndex}: new page ${newIndex} [${startPos}..${endPos}], total: ${this.pages.length}`
    )
    this.markDirty(newIndex) //TODO
  }

  splitLastPage(splitPos: number): void {
    if (this.pages.length === 0) {
      this.pages.push({ pageIndex: 0, startPos: 0, endPos: splitPos })
      return
    }

    const newIndex = this.pages.length
    const lastPage = this.pages[newIndex - 1]
    if (splitPos <= lastPage.startPos || splitPos >= lastPage.endPos) {
      logger.log(
        'pagemap',
        `splitLastPage FAILED: splitPos ${splitPos} is out of bounds of the last page [${lastPage.startPos}..${lastPage.endPos}]`
      )
      return
    }
    const newPage: PageEntry = {
      pageIndex: newIndex,
      startPos: splitPos,
      endPos: lastPage.endPos,
    }
    lastPage.endPos = splitPos
    this.pages.push(newPage)
    this.markDirty(newIndex) //TODO

    logger.log(
      'pagemap',
      `splitLastPage: split page ${newIndex - 1} at ${splitPos}, new page ${newIndex} [${newPage.startPos}..${newPage.endPos}]`
    )
  }

  /**
   * Remove a page (use when a page becomes empty after fusion/pull).
   */
  removePage(pageIndex: number): void {
    this.pages.splice(pageIndex, 1)

    for (let i = pageIndex; i < this.pages.length; i++) {
      this.pages[i].pageIndex = i
    }

    this.dirty.delete(pageIndex)
    // Rebuild dirty set with updated indices
    const newDirty = new Set<number>()
    for (const idx of this.dirty) {
      if (idx > pageIndex) newDirty.add(idx - 1)
      else if (idx < pageIndex) newDirty.add(idx)
    }
    this.dirty = newDirty
  }

  /**
   * Map all stored positions through a PM transaction mapping.
   * Must be called on every docChanged transaction to keep positions valid.
   */
  applyMapping(mapping: Mapping): void {
    for (const page of this.pages) {
      page.startPos = mapping.map(page.startPos)
      page.endPos = mapping.map(page.endPos)
    }
  }

  /**
   * Snap page boundaries to top-level node boundaries in the new document.
   *
   * After `applyMapping`, a boundary position can land inside a merged node
   * (e.g. after a join/backspace at the boundary). When that happens, the
   * same node appears in both `nodesBetween` ranges and is double-counted
   * during overflow detection. This method fixes that by advancing any
   * mid-node boundary to the end of the containing top-level node.
   *
   * Must be called AFTER `applyMapping`.
   */
  snapBoundaries(doc: PMNode): boolean {
    if (this.pages.length === 0) return false

    let snapped = false
    // if (this.pages[0].startPos !== 0) {
    //   logger.log('pagemap', `snapBoundaries: first page startPos ${this.pages[0].startPos} → 0`)
    //   this.pages[0].startPos = 0
    //   this.markDirty(0)
    //   snapped = true
    // }
    let prevBoundaryPos = 0
    for (let i = 0; i < this.pages.length; i++) {
      const page = this.pages[i]
      // const next = this.pages[i + 1]

      const boundaryPos = page.endPos
      const $pos = doc.resolve(boundaryPos)
      const isMidNode = $pos.depth > 0 && !($pos.depth === 1 && $pos.parentOffset === 0)
      if (boundaryPos < 0 || boundaryPos > doc.content.size) {
        logger.log(
          'pagemap',
          `snapBoundaries: page ${i} endPos ${boundaryPos} is invalid. Setting to doc end ${doc.content.size}.`
        )
        page.endPos = doc.content.size
        this.markDirty(i)
        snapped = true
      }
      if (page.startPos !== prevBoundaryPos) {
        logger.log(
          'pagemap',
          `snapBoundaries: page ${i} startPos ${page.startPos} → ${prevBoundaryPos} (snapped to previous page end)`
        )
        page.startPos = prevBoundaryPos
        this.markDirty(i)
        snapped = true
      } else if (isMidNode) {
        const nextNode = $pos.after(1)
        if (nextNode !== boundaryPos) {
          logger.log(
            'pagemap',
            `snapBoundaries: page ${i} endPos ${boundaryPos} → ${nextNode} (mid-node, snapped to node end)`
          )
          page.endPos = nextNode
          this.markDirty(i)
          snapped = true
        }
      }
      prevBoundaryPos = boundaryPos
    }

    // Check last page endPos against doc size
    // Should never trigger, because it should have been handled above..
    const lastPage = this.pages[this.pages.length - 1]
    if (lastPage.endPos !== doc.content.size) {
      logger.log(
        'pagemap',
        `snapBoundaries: last page endPos ${lastPage.endPos} → ${doc.content.size} (snapped to doc end)`
      )
      lastPage.endPos = doc.content.size
      this.markDirty(this.pages.length - 1)
      snapped = true
    }

    return snapped
  }

  /**
   * Full reconstruction from the document using `DomColumnHeight` estimates.
   * Used at initialisation and as a fallback after desync.
   */
  rebuild(doc: PMNode, geometry: PageGeometry): void {
    this.pages = []
    this.dirty = new Set()
    const col = DomColumnHeight.fromPageGeometry(geometry)
    let pageStart = 0
    let pageIndex = 0

    doc.forEach((node, offset) => {
      // `offset` is the block position of this top-level node — the value
      // nodeDOM() expects and the correct position for page boundaries.
      // Do NOT use offset + 1 here: that position is inside the node and would
      // cause the breaker widget to render as a child of the node, inflating
      // its measured height during the first DOM-based reflow pass.
      const estimatedHeight = estimateNodeHeight(node)

      if (!col.tryAddChild(estimatedHeight, 0, 0)) {
        // Node overflows current page — close this page at offset (node boundary).
        this.pages.push({
          pageIndex,
          startPos: pageStart,
          endPos: offset,
        })
        pageStart = offset
        pageIndex++
        col.reset(geometry.contentHeight)
        col.tryAddChild(estimatedHeight, 0, 0)
      }
    })

    // Final page
    this.pages.push({
      pageIndex,
      startPos: pageStart,
      endPos: doc.content.size,
    })

    logger.log(
      'pagemap',
      `rebuild: ${this.pages.length} page(s) estimated`,
      this.pages.map((p) => `[${p.startPos}..${p.endPos}]`)
    )
  }

  // ── Dirty tracking ─────────────────────────────────────────────────────────

  markDirty(pageIndex: number): void {
    this.dirty.add(pageIndex)
  }

  /**
   * Mark all pages touched by a transaction as dirty, plus immediate neighbours.
   *
   * Must be called BEFORE `applyMapping` — step maps carry old positions that
   * must be compared against old (pre-mapping) page positions.
   *
   * Neighbours are marked because:
   *   - next page: an insertion on page N may push content onto page N+1.
   *   - prev page: a deletion on page N may leave room to pull from page N-1,
   *     or the deletion itself may have started on page N-1.
   */
  markDirtyFromTransaction(tr: Transaction): void {
    tr.steps.forEach((step) => {
      const map = step.getMap()
      map.forEach((oldStart, oldEnd) => {
        for (const page of this.pages) {
          if (oldStart < page.endPos && oldEnd > page.startPos) {
            this.dirty.add(page.pageIndex)
            if (page.pageIndex + 1 < this.pages.length) {
              this.dirty.add(page.pageIndex + 1)
            }
            if (page.pageIndex > 0) {
              this.dirty.add(page.pageIndex - 1)
            }
          }
        }
      })
    })
  }

  isDirty(pageIndex: number): boolean {
    return this.dirty.has(pageIndex)
  }

  dirtyPages(): number[] {
    return Array.from(this.dirty).sort((a, b) => a - b)
  }

  clearDirty(): void {
    this.dirty.clear()
  }
}

// ── Height estimation (no DOM) ─────────────────────────────────────────────

const FALLBACK_LINE_HEIGHT = 24
const CHARS_PER_LINE = 80

function estimateNodeHeight(node: PMNode): number {
  switch (node.type.name) {
    case 'paragraph':
    case 'heading': {
      const lines = Math.max(1, Math.ceil(node.textContent.length / CHARS_PER_LINE))
      return lines * FALLBACK_LINE_HEIGHT
    }
    case 'table':
      return 200 // rough estimate until DOM is available
    default:
      return FALLBACK_LINE_HEIGHT * 2
  }
}
