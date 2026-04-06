import type { EditorView } from '@tiptap/pm/view'
import type { Transaction } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { PaginationOptions, HeightCache, HeightCacheKey } from '../types'
import type { PageGeometry } from '../utils/PageGeometry'
import { DomColumnHeight } from '../utils/DomColumnHeight'
import { TextSplitFinder } from './TextSplitFinder'
import { TableSplitAnalyzer } from './TableSplitAnalyzer'
import { SplitRegistry } from './SplitRegistry'
import { PaginationTransaction } from './PaginationTransaction'
import { PageMap } from './PageMap'
import { logger } from '../utils/logger'

export interface ReflowResult {
  /** Structural correction transaction, or null if no splits/moves were needed. */
  correctionTr: Transaction | null
  /** DOM-measured accumulated content height per page index, or null if debounced. */
  pageHeights: Map<number, number> | null
}

interface OverflowResultPhase1 {
  pageIndex: number
  nodePos: number
  // nodeType: string
  // remainingHeight: number
  node: PMNode
}
interface OverflowResultPhase2 extends OverflowResultPhase1 {
  domCol: DomColumnHeight
  domEl: HTMLElement
}

type SplitResult = 'split' | 'moveBlock' | 'unhandled' // | 'notNeeded' | 'pull' | 'fuse'

/**
 * Orchestrates the two-phase reflow cycle:
 *
 * Phase 1 (appendTransaction / sync):
 *   - Cache-based overflow estimation
 *   - Block-level node moves (whole paragraphs/tables)
 *   - PageMap boundary updates
 *
 * Phase 2 (view.update / async):
 *   - DOM measurement and height cache update
 *   - Overflow verification and correction
 *   - Sub-paragraph splitting via TextSplitFinder
 *   - Table row splitting via TableSplitAnalyzer
 *   - Fusion of split fragments on the same page
 *
 * All generated transactions have `addToHistory: false`.
 */
export class ReflowController {
  private readonly config: PaginationOptions
  private readonly geometry: PageGeometry
  private readonly textFinder: TextSplitFinder
  private readonly tableFinder: TableSplitAnalyzer
  readonly splitRegistry: SplitRegistry

  private lastReflowTime = 0

  constructor(config: PaginationOptions, geometry: PageGeometry, splitRegistry: SplitRegistry) {
    this.config = config
    this.geometry = geometry
    this.textFinder = new TextSplitFinder(config)
    this.tableFinder = new TableSplitAnalyzer()
    this.splitRegistry = splitRegistry
  }

  // ── Phase 2: view.update entry point ──────────────────────────────────────

  /**
   * Called from `view.update()`. Debounced by `config.debounceMs`.
   * Always returns a result so the caller can update spacer decorations even
   * when no structural changes occurred.
   */
  onViewUpdate(view: EditorView, pageMap: PageMap, heightCache: HeightCache): ReflowResult {
    const now = Date.now()
    const elapsed = now - this.lastReflowTime
    if (elapsed < this.config.debounceMs) {
      logger.log('reflow', `debounced (${elapsed}ms < ${this.config.debounceMs}ms)`)
      return { correctionTr: null, pageHeights: null }
    }

    return this.runReflow(view, pageMap, heightCache)
  }

  /**
   * Bypass debounce — used after paste or forced reflow (e.g. resize).
   */
  forceReflow(view: EditorView, pageMap: PageMap, heightCache: HeightCache): ReflowResult {
    return this.runReflow(view, pageMap, heightCache)
  }

  // ── Phase 1: appendTransaction entry point ────────────────────────────────

  /**
   * Called from `appendTransaction`. No DOM access — uses height cache only.
   * Returns a transaction if block-level moves are needed.
   */
  onAppendTransaction(
    view: EditorView,
    pageMap: PageMap,
    heightCache: HeightCache
  ): Transaction | null {
    const dirtyPages = pageMap.dirtyPages()
    if (dirtyPages.length === 0) return null

    const tr = view.state.tr
    const ptx = new PaginationTransaction(tr, this.splitRegistry)
    let changed = false

    for (const pageIndex of dirtyPages) {
      const page = pageMap.getPage(pageIndex)
      if (!page) continue

      const overflow = this.estimateOverflow(
        view.state.doc,
        page.startPos,
        page.endPos,
        heightCache
      )
      if (!overflow) continue

      // Only handle whole-block moves in Phase 1; sub-paragraph splitting is Phase 2
      if (overflow.node.type.name !== 'paragraph' || !this.config.splitParagraphs) {
        ptx.moveToNextPage(overflow.nodePos, pageMap)
        changed = true
      }
    }

    return changed ? ptx.finalize() : null
  }

  // ── Private: core reflow logic ────────────────────────────────────────────

  private runReflow(view: EditorView, pageMap: PageMap, heightCache: HeightCache): ReflowResult {
    this.lastReflowTime = Date.now()

    const tr = view.state.tr
    const ptx = new PaginationTransaction(tr, this.splitRegistry)
    let changed = false

    // Update height cache from DOM
    this.measureAndCacheHeights(view, pageMap, heightCache)

    const dirtyPages = pageMap.dirtyPages()
    logger.group(
      'reflow',
      `runReflow — ${dirtyPages.length} dirty page(s): [${dirtyPages}]`,
      () => {
        logger.log(
          'reflow',
          `contentHeight: ${this.geometry.contentHeight}px, docSize: ${view.state.doc.content.size}`
        )
      }
    )

    let safety = 0
    const remaining = [...dirtyPages]
    // Only one actual doc split (tr.split) is allowed per runReflow pass.
    // Subsequent tr.split calls would operate on stale old-doc positions because
    // view.state and view.nodeDOM still reflect the pre-dispatch document.
    // Block-boundary moves (moveToNextPage) only touch the PageMap so they are
    // safe to batch; doc splits are not.
    let docSplitDone = false

    while (remaining.length > 0 && safety++ < this.config.maxIterations) {
      const pageIndex = remaining.shift()!
      const page = pageMap.getPage(pageIndex)
      if (!page) continue

      logger.log('overflow', `checking page ${pageIndex} [${page.startPos}..${page.endPos}]`)

      const overflow = this.detectOverflow(view, page.startPos, page.endPos)
      if (!overflow) {
        logger.log('overflow', `page ${pageIndex} — no overflow`)
        if (!docSplitDone) {
          // Pulling also uses DOM positions — safe to do before a doc split,
          // but skip after one since the DOM hasn't updated yet.
          const pulled = this.tryPull(view, pageIndex, pageMap, ptx)
          if (pulled) {
            logger.log('overflow', `page ${pageIndex} — pulled node from next page`)
            changed = true
          }
        }
        continue
      }

      // Fill in the page index — detectOverflow can't know it.
      overflow.pageIndex = pageIndex

      logger.log(
        'overflow',
        `page ${pageIndex} — overflow at pos ${overflow.nodePos} (${overflow.node.type}), remaining: ${overflow.domCol.remaining.toFixed(1)}px`
      )

      const splitResult = this.handleOverflow(view, overflow, pageMap, ptx, docSplitDone)
      if (splitResult !== 'unhandled') {
        changed = true
        // If handleOverflow performed a doc split, record it and stop processing
        // further pages — remaining dirty pages will be re-queued by the next RAF.
        if (!docSplitDone && splitResult === 'split') {
          docSplitDone = true
          logger.log(
            'reflow',
            `doc split performed on page ${pageIndex} — stopping pass to avoid stale positions`
          )
          break
        }
        remaining.push(pageIndex + 1)
      }
    }

    if (safety >= this.config.maxIterations) {
      logger.log(
        'reflow',
        `⚠ hit maxIterations (${this.config.maxIterations}) — reflow may be incomplete`
      )
    }

    // Skip fusion when a doc split was performed — the transaction already
    // contains a tr.split step and fuse candidates still hold pre-split
    // positions. Running fuseNodes here would resolve stale positions against
    // the modified doc and crash with "NodeType.create can't construct text nodes".
    // Fusion will be re-evaluated on the next RAF pass after the split dispatches.
    if (!docSplitDone) {
      const fused = this.fuseIfNeeded(view, pageMap, ptx)
      if (fused) {
        logger.log('split', 'fused split fragments on same page')
        changed = true
      }
    } else {
      logger.log('split', 'doc split performed — skipping fuseIfNeeded this pass')
    }

    // Measure final page heights from DOM for accurate spacer sizing.
    // Must happen BEFORE applyMapping below — measurePageHeights uses view.state.doc
    // which still reflects the pre-dispatch document, so positions must match it.
    const pageHeights = this.measurePageHeights(view, pageMap)

    if (docSplitDone) {
      // Split performed — positions were already set in new-doc coordinates by
      // splitParagraphAt (via tr.mapping). Leave dirty and reset debounce so the
      // follow-up RAF continues paginating the remaining dirty pages.
      this.lastReflowTime = 0
      logger.log(
        'reflow',
        'doc split done — leaving dirty pages for next RAF pass (debounce reset)'
      )
    } else {
      // Fuse operations (tr.join) shift positions of all subsequent nodes by -2.
      // Apply the accumulated transaction mapping to bring pageMap in sync with
      // the new doc that will exist after dispatch. For pure PageMap-only passes
      // this is a no-op (identity mapping — no doc steps added to ptx.tr).
      pageMap.applyMapping(ptx.tr.mapping)

      if (ptx.tr.docChanged) {
        // A fuse (or similar) changed the doc — heights were measured against the
        // old DOM. Leave dirty pages and reset debounce so the follow-up pass
        // remeasures against the fused document.
        this.lastReflowTime = 0
        logger.log(
          'reflow',
          'fuse changed doc — leaving dirty pages for remeasurement pass (debounce reset)'
        )
      } else {
        pageMap.clearDirty()
      }
    }

    logger.log(
      'reflow',
      `runReflow done — changed: ${changed}, pages: ${pageMap.length}, dirty: [${pageMap.dirtyPages()}]`
    )
    return { correctionTr: changed ? ptx.finalize() : null, pageHeights }
  }

  // ── Overflow detection ─────────────────────────────────────────────────────

  /**
   * Cache-based overflow detection (Phase 1 — no DOM).
   */
  private estimateOverflow(
    doc: PMNode,
    startPos: number,
    endPos: number,
    heightCache: HeightCache
  ): OverflowResultPhase1 | null {
    const col = DomColumnHeight.fromPageGeometry(this.geometry)
    let result: OverflowResultPhase1 | null = null

    doc.nodesBetween(startPos, endPos, (node, pos) => {
      if (result) return false
      if (!node.isBlock || node === doc) return true

      const key = cacheKey(node)
      const height = heightCache.get(key) ?? fallbackHeight(node)

      if (!col.tryAddChild(height, 0, 0)) {
        result = {
          pageIndex: 0, // caller fills this in
          nodePos: pos,
          // nodeType: node.type.name,
          // remainingHeight: col.remaining,
          node,
        }
      }
      return false // don't descend into block children
    })

    return result
  }

  /**
   * DOM-based overflow detection (Phase 2).
   */
  private detectOverflow(
    view: EditorView,
    startPos: number,
    endPos: number
  ): OverflowResultPhase2 | null {
    const { doc } = view.state
    const col = DomColumnHeight.fromPageGeometry(this.geometry)
    let result: OverflowResultPhase2 | null = null

    const isVerbose = logger.isEnabled('overflow')
    const nodeRows: Array<{
      pos: number
      type: string
      el: HTMLElement
      h: number
      mt: number
      mb: number
      accumulated: number
      fits: boolean
    }> = []

    doc.nodesBetween(startPos, endPos, (node, pos) => {
      if (result) return false
      if (!node.isBlock || node === doc) return true

      const domEl = view.nodeDOM(pos) as HTMLElement | null
      if (!domEl) return false

      const { fits, ...size } = col.tryAddChild(domEl)

      if (isVerbose) {
        nodeRows.push({
          pos,
          type: node.type.name,
          el: domEl,
          h: size.height,
          mt: size.mt,
          mb: size.mb,
          accumulated: col.height,
          fits,
        })
      }

      if (!fits) {
        result = {
          pageIndex: 0,
          nodePos: pos,
          node,
          domEl,
          domCol: col,
        }
      }
      return false
    })

    if (isVerbose) {
      logger.group(
        'overflow',
        `detectOverflow [${startPos}..${endPos}] — maxH: ${this.geometry.contentHeight}px`,
        () => {
          for (const row of nodeRows) {
            const mark = row.fits ? '  ✓' : '  ✗ OVERFLOW'
            console.log(
              `%c  pos ${row.pos} ${row.type}%c  h=${row.h.toFixed(1)} mt=${row.mt.toFixed(1)} mb=${row.mb.toFixed(1)}  accumulated=${row.accumulated.toFixed(1)}${mark}`,
              'color: #6b7280',
              '',
              row.el
            )
          }
        }
      )
    }

    return result
  }

  // ── Split handling ─────────────────────────────────────────────────────────

  /** Returns `'split'` when a doc split was performed, `true` for a page-map-only move, `false` for no-op. */
  private handleOverflow(
    view: EditorView,
    overflow: OverflowResultPhase2,
    pageMap: PageMap,
    ptx: PaginationTransaction,
    _docSplitDone: boolean = false
  ): SplitResult {
    const { nodePos, node, domCol, domEl, pageIndex } = overflow
    const nodeType = node.type.name
    // const node = view.state.doc.nodeAt(nodePos)
    if (!node) return 'unhandled'
    // if (!domEl) {
    //   //TODO - check if OverflowResult may have domEl null or if this is redundant
    //   logger.log('split', `block at ${nodePos} — no DOM element, moving whole block`)
    //   ptx.moveToNextPage(nodePos, pageMap)
    //   return 'moveBlock'
    // }
    // TODO - check needed? This function should not be called without a valid
    // overflow result which means we already have determined that el bottom exceeds pageBottom
    // const { rect } = domCol.getComputed(domEl, { rect: true, style: false })
    // const pageBottom = domCol.findMaxBottomForElement(domEl)
    // if (rect.bottom <= pageBottom) {
    //   logger.log(
    //     'split',
    //     `${nodeType} at ${nodePos} — DOM rect fits (overflow ${(rect.bottom - pageBottom).toFixed(1)}px ≤ 0), skipping`
    //   )
    //   return 'notNeeded'
    // }

    if (nodeType === 'paragraph' && this.config.splitParagraphs) {
      return this.splitParagraph(view, overflow, pageMap, ptx)
    }
    if (nodeType === 'table' && this.config.splitTables) {
      return this.splitTable(view, overflow, pageMap, ptx)
    }

    // ── Default: move entire block to next page ──
    // const domEl = view.nodeDOM(nodePos) as HTMLElement | null

    ptx.moveToNextPage(nodePos, pageMap)
    return 'moveBlock'
  }

  private splitParagraph(
    view: EditorView,
    overflow: OverflowResultPhase2,
    pageMap: PageMap,
    ptx: PaginationTransaction
  ): SplitResult {
    const { nodePos, node, domCol, domEl, pageIndex } = overflow
    if (!domEl) {
      logger.log('split', `paragraph at ${nodePos} — no DOM element, moving whole block`)
      ptx.moveToNextPage(nodePos, pageMap)
      return 'moveBlock'
    }

    // const parRect = domEl.getBoundingClientRect()

    // // Compute pageBottom from the overflowing node's DOM position and the
    // // remaining column space when overflow was detected.
    // // remainingHeight = contentHeight - accumulatedHeightBeforeThisNode
    // // → pageBottom = parRect.top + remainingHeight
    // // This is robust regardless of whether the page's first node is in the
    // // DOM (avoids getPageBottomY returning Infinity for new/off-screen pages).
    // const pageBottom = parRect.top + remainingHeight

    // const parMb = parseFloat(getComputedStyle(domEl).marginBottom) || 0
    // const mb = Math.max(parMb, this.geometry.footerMargins.inner)
    // const parBottom = parRect.bottom + mb

    // const domOverflow = parBottom - pageBottom
    // logger.log(
    //   'split',
    //   `paragraph at ${nodePos} — el.top: ${parRect.top.toFixed(1)}, el.bottom: ${parBottom.toFixed(1)}, pageBottom: ${pageBottom.toFixed(1)} (remaining ${remainingHeight.toFixed(1)}px), overflow: ${domOverflow.toFixed(1)}px`,
    //   domEl
    // )

    // // DomColumnHeight uses margin-collapsed accounting which can report a
    // // node as overflowing when the actual DOM rect fits. If the element ends
    // // before the page bottom, treat this as a false positive and skip.
    // if (domOverflow <= 0) {
    //   logger.log(
    //     'split',
    //     `paragraph at ${nodePos} — DOM rect fits (overflow ${domOverflow.toFixed(1)}px ≤ 0), skipping`
    //   )
    //   return 'notNeeded'
    // }

    const splitResult = this.textFinder.find(domEl, domCol)

    if (!splitResult) {
      logger.log('split', `paragraph at ${nodePos} — no split point found, moving whole block`)
      ptx.moveToNextPage(nodePos, pageMap)
      return 'moveBlock'
    }

    logger.log(
      'split',
      `paragraph at ${nodePos} — splitting at char offset ${splitResult.offset} (head: ${splitResult.headLines} lines, tail: ${splitResult.tailLines} lines, wordBoundary: ${splitResult.adjustedToWordBoundary})`,
      domEl
    )
    const pmPos = this.textFinder.toPmPos(splitResult, view)
    const { tailPos } = ptx.splitParagraphAt(pmPos, nodePos, node.attrs, pageIndex)

    // Update the PageMap boundary so head of split stays on pageIndex and tail moves to
    // pageIndex + 1. Without this fuseIfNeeded sees both on the same page and
    // immediately fuses them → infinite loop.
    const currentPage = pageMap.getPage(pageIndex)
    pageMap.setSplitBoundary(pageIndex, tailPos)

    logger.log(
      'pagemap',
      `split boundary set: page ${pageIndex} endPos → ${tailPos}, tail on page ${pageIndex + 1}`
    )
    return 'split'
  }

  private splitTable(
    view: EditorView,
    overflow: OverflowResultPhase2,
    pageMap: PageMap,
    ptx: PaginationTransaction
  ): SplitResult {
    const { nodePos, node, domCol, domEl, pageIndex } = overflow

    // const tableRect = domEl.getBoundingClientRect()
    // const pageBottom = tableRect.top + remainingHeight
    // if (tableRect.bottom <= pageBottom) {
    //   logger.log(
    //     'split',
    //     `table at ${nodePos} — DOM rect fits (overflow ${(tableRect.bottom - pageBottom).toFixed(1)}px ≤ 0), skipping`
    //   )
    //   return false
    // }

    //TODO: Check and improve table splitting logic!
    const { estimatedRemainingBlockHeight } = domCol.peekChild(domEl)
    const plan = this.tableFinder.analyze(node, domEl, estimatedRemainingBlockHeight)
    if (!plan || plan.splitBeforeRow === null) {
      logger.log(
        'split',
        `table at ${nodePos} — no safe split row (${plan ? 'rowspan conflict' : 'fits'}), moving whole table`,
        domEl
      )
      ptx.moveToNextPage(nodePos, pageMap)
      return 'moveBlock'
    }

    // TODO: implement actual table row split transaction
    logger.log(
      'split',
      `table at ${nodePos} — safe split before row ${plan.splitBeforeRow} (of ${plan.rowHeights.length} rows), table splitting not yet implemented — moving whole table`,
      { rowHeights: plan.rowHeights, unsafeRows: [...plan.unsafeRows] },
      domEl
    )
    ptx.moveToNextPage(nodePos, pageMap)
    return 'moveBlock'
  }

  // ── Pull correction ────────────────────────────────────────────────────────

  private tryPull(
    view: EditorView,
    pageIndex: number,
    pageMap: PageMap,
    ptx: PaginationTransaction
  ): boolean {
    const { doc } = view.state
    let pulled = false

    // Loop: keep pulling nodes from the next page as long as they fit.
    // Each iteration re-reads the next page because its startPos advances
    // after each pull (and the page may be removed when emptied).
    while (true) {
      const page = pageMap.getPage(pageIndex)
      const nextPage = pageMap.getPage(pageIndex + 1)
      if (!page || !nextPage) break

      // Stop if next page is empty (shouldn't happen normally, but guard anyway).
      if (nextPage.startPos >= nextPage.endPos) {
        pageMap.removePage(pageIndex + 1)
        logger.log('overflow', `page ${pageIndex + 1} became empty after pull — removed`)
        break
      }

      const firstNodePos = nextPage.startPos
      const firstNodeDOM = view.nodeDOM(firstNodePos) as HTMLElement | null
      if (!firstNodeDOM) break

      // Re-accumulate current page height (boundary may have moved in previous iteration).
      const col = DomColumnHeight.fromPageGeometry(this.geometry)
      doc.nodesBetween(page.startPos, page.endPos, (node, pos) => {
        if (!node.isBlock || node === doc) return true
        const domEl = view.nodeDOM(pos) as HTMLElement | null
        if (domEl) col.tryAddChild(domEl)
        return false
      })

      const peek = col.peekChild(firstNodeDOM)
      logger.log(
        'overflow',
        `page ${pageIndex} pull check — accumulated: ${col.height.toFixed(1)}px, remaining: ${col.remaining.toFixed(1)}px, candidate h: ${peek.elementHeight.toFixed(1)}px, fits: ${peek.fits}`,
        firstNodeDOM
      )

      if (!peek.fits) break

      ptx.pullFromNextPage(pageIndex, pageMap)
      pulled = true

      // If the next page was just emptied, remove it and stop.
      const updatedNext = pageMap.getPage(pageIndex + 1)
      if (updatedNext && updatedNext.startPos >= updatedNext.endPos) {
        pageMap.removePage(pageIndex + 1)
        logger.log('overflow', `page ${pageIndex + 1} became empty after pull — removed`)
        break
      }
    }

    return pulled
  }

  // ── Fusion ────────────────────────────────────────────────────────────────

  private fuseIfNeeded(view: EditorView, pageMap: PageMap, ptx: PaginationTransaction): boolean {
    this.splitRegistry.syncPageIndexes(pageMap)
    const candidates = this.splitRegistry.findFusionCandidates()
    if (candidates.length === 0) return false

    // Fuse only ONE pair per pass, matching the one-split-per-pass constraint.
    // After tr.join, all subsequent positions are stale — batching multiple fuses
    // in one transaction causes "Structure replace would overwrite content" crashes.
    // Remaining candidates are handled in follow-up passes (debounce reset ensures
    // the next RAF fires immediately).
    const { leading, trailing } = candidates[0]
    const headNode = view.state.doc.nodeAt(leading.pos)
    const tailNode = view.state.doc.nodeAt(trailing.pos)
    if (!headNode || !tailNode) {
      logger.log(
        'split',
        `fuse candidate at ${leading.pos} and ${trailing.pos} — invalid node position(s), skipping`
      )
      return false
    }

    logger.log(
      'split',
      `fuseIfNeeded: fusing a@${leading.pos} b@${trailing.pos} (splitId ${leading.splitId}), ${candidates.length - 1} more candidate(s) pending`
    )
    ptx.fuseNodes(leading.pos, trailing.pos, leading.pageIndex)
    return true
  }

  // ── Height cache ───────────────────────────────────────────────────────────

  private measureAndCacheHeights(
    view: EditorView,
    pageMap: PageMap,
    heightCache: HeightCache
  ): void {
    const { doc } = view.state
    let measured = 0
    const isVerbose = logger.isEnabled('reflow')

    for (const pageIndex of pageMap.dirtyPages()) {
      const page = pageMap.getPage(pageIndex)
      if (!page) continue

      const pageRows: Array<{
        pos: number
        type: string
        key: string
        el: HTMLElement
        h: number
      }> = []

      doc.nodesBetween(page.startPos, page.endPos, (node, pos) => {
        if (!node.isBlock || node === doc) return true
        const domEl = view.nodeDOM(pos) as HTMLElement | null
        if (!domEl) return false

        const key = cacheKey(node)
        const h = domEl.getBoundingClientRect().height
        heightCache.set(key, h)
        measured++

        if (isVerbose) pageRows.push({ pos, type: node.type.name, key, el: domEl, h })
        return false
      })

      if (isVerbose && pageRows.length > 0) {
        logger.group(
          'reflow',
          `cache: page ${pageIndex} — ${pageRows.length} node(s) measured`,
          () => {
            for (const row of pageRows) {
              console.log(
                `%c  pos ${row.pos} ${row.type}%c  h=${row.h.toFixed(1)}px  key="${row.key}"`,
                'color: #6b7280',
                '',
                row.el
              )
            }
          }
        )
      }
    }

    logger.log(
      'reflow',
      `height cache: ${measured} node(s) measured, total entries: ${heightCache.size}`
    )
  }

  /**
   * Measure accumulated DOM content height for every page in the map.
   * Returns a Map<pageIndex, contentHeightPx> used by buildDecorations to
   * compute accurate spacer heights.
   */
  private measurePageHeights(view: EditorView, pageMap: PageMap): Map<number, number> {
    const { doc } = view.state
    const result = new Map<number, number>()

    for (const page of pageMap.allPages()) {
      const col = new DomColumnHeight(
        Infinity,
        this.geometry.headerMargins.inner,
        this.geometry.footerMargins.inner
      )

      doc.nodesBetween(page.startPos, page.endPos, (node, pos) => {
        if (!node.isBlock || node === doc) return true
        const domEl = view.nodeDOM(pos) as HTMLElement | null
        if (domEl) col.tryAddChild(domEl)
        return false
      })

      result.set(page.pageIndex, col.height)
    }

    return result
  }

  // ── Geometry helpers ───────────────────────────────────────────────────────
}

// ── Cache key ─────────────────────────────────────────────────────────────────

function cacheKey(node: PMNode): HeightCacheKey {
  const type = node.type.name
  const fontSize = (node.attrs.fontSize as string | undefined) ?? 'default'
  const lineHeight = (node.attrs.lineHeight as string | undefined) ?? 'default'
  const len = node.content.size
  return `${type}:${fontSize}:${lineHeight}:${len}`
}

// ── Fallback height (no DOM) ──────────────────────────────────────────────────

const FALLBACK_LINE_HEIGHT = 24
const CHARS_PER_LINE = 80

function fallbackHeight(node: PMNode): number {
  switch (node.type.name) {
    case 'paragraph':
    case 'heading': {
      const lines = Math.max(1, Math.ceil(node.textContent.length / CHARS_PER_LINE))
      return lines * FALLBACK_LINE_HEIGHT
    }
    case 'table':
      return 200
    default:
      return FALLBACK_LINE_HEIGHT * 2
  }
}
