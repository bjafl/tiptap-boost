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

interface OverflowResult {
  pageIndex: number
  nodePos: number
  nodeType: string
  remainingHeight: number
}

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
   * Returns a transaction to dispatch (or null if nothing to do).
   */
  onViewUpdate(view: EditorView, pageMap: PageMap, heightCache: HeightCache): Transaction | null {
    const now = Date.now()
    const elapsed = now - this.lastReflowTime
    if (elapsed < this.config.debounceMs) {
      logger.log('reflow', `debounced (${elapsed}ms < ${this.config.debounceMs}ms)`)
      return null
    }

    return this.runReflow(view, pageMap, heightCache)
  }

  /**
   * Bypass debounce — used after paste or forced reflow (e.g. resize).
   */
  forceReflow(view: EditorView, pageMap: PageMap, heightCache: HeightCache): Transaction | null {
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
      if (overflow.nodeType !== 'paragraph' || !this.config.splitParagraphs) {
        ptx.moveToNextPage(overflow.nodePos, pageMap)
        changed = true
      }
    }

    return changed ? ptx.finalize() : null
  }

  // ── Private: core reflow logic ────────────────────────────────────────────

  private runReflow(
    view: EditorView,
    pageMap: PageMap,
    heightCache: HeightCache
  ): Transaction | null {
    this.lastReflowTime = Date.now()

    const tr = view.state.tr
    const ptx = new PaginationTransaction(tr, this.splitRegistry)
    let changed = false

    // Update height cache from DOM
    this.measureAndCacheHeights(view, pageMap, heightCache)

    const dirtyPages = pageMap.dirtyPages()
    logger.group('reflow', `runReflow — ${dirtyPages.length} dirty page(s): [${dirtyPages}]`, () => {
      logger.log('reflow', `contentHeight: ${this.geometry.contentHeight}px, docSize: ${view.state.doc.content.size}`)
    })

    let safety = 0
    const remaining = [...dirtyPages]

    while (remaining.length > 0 && safety++ < this.config.maxIterations) {
      const pageIndex = remaining.shift()!
      const page = pageMap.getPage(pageIndex)
      if (!page) continue

      logger.log('overflow', `checking page ${pageIndex} [${page.startPos}..${page.endPos}]`)

      const overflow = this.detectOverflow(view, page.startPos, page.endPos)
      if (!overflow) {
        logger.log('overflow', `page ${pageIndex} — no overflow`)
        const pulled = this.tryPull(view, pageIndex, pageMap, ptx)
        if (pulled) {
          logger.log('overflow', `page ${pageIndex} — pulled node from next page`)
          changed = true
        }
        continue
      }

      logger.log('overflow', `page ${pageIndex} — overflow at pos ${overflow.nodePos} (${overflow.nodeType}), remaining: ${overflow.remainingHeight.toFixed(1)}px`)

      const handled = this.handleOverflow(view, overflow, pageMap, ptx)
      if (handled) {
        changed = true
        remaining.push(pageIndex + 1)
      }
    }

    if (safety >= this.config.maxIterations) {
      logger.log('reflow', `⚠ hit maxIterations (${this.config.maxIterations}) — reflow may be incomplete`)
    }

    const fused = this.fuseIfNeeded(view, pageMap, ptx)
    if (fused) {
      logger.log('split', 'fused split fragments on same page')
      changed = true
    }

    pageMap.clearDirty()

    logger.log('reflow', `runReflow done — changed: ${changed}, pages: ${pageMap.length}`)
    return changed ? ptx.finalize() : null
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
  ): OverflowResult | null {
    const col = new DomColumnHeight(this.geometry.contentHeight)
    let result: OverflowResult | null = null

    doc.nodesBetween(startPos, endPos, (node, pos) => {
      if (result) return false
      if (!node.isBlock || node === doc) return true

      const key = cacheKey(node)
      const height = heightCache.get(key) ?? fallbackHeight(node)

      if (!col.tryAddChild(height, 0, 0)) {
        result = {
          pageIndex: 0, // caller fills this in
          nodePos: pos,
          nodeType: node.type.name,
          remainingHeight: col.remaining,
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
  ): OverflowResult | null {
    const { doc } = view.state
    const col = new DomColumnHeight(this.geometry.contentHeight)
    let result: OverflowResult | null = null

    const isVerbose = logger.isEnabled('overflow')
    const nodeRows: Array<{ pos: number; type: string; el: HTMLElement; h: number; mt: number; mb: number; accumulated: number; fits: boolean }> = []

    doc.nodesBetween(startPos, endPos, (node, pos) => {
      if (result) return false
      if (!node.isBlock || node === doc) return true

      const domEl = view.nodeDOM(pos) as HTMLElement | null
      if (!domEl) return false

      const fits = col.tryAddChild(domEl)

      if (isVerbose) {
        const rect = domEl.getBoundingClientRect()
        const style = getComputedStyle(domEl)
        nodeRows.push({
          pos,
          type: node.type.name,
          el: domEl,
          h: rect.height,
          mt: parseFloat(style.marginTop) || 0,
          mb: parseFloat(style.marginBottom) || 0,
          accumulated: col.height,
          fits,
        })
      }

      if (!fits) {
        result = {
          pageIndex: 0,
          nodePos: pos,
          nodeType: node.type.name,
          remainingHeight: col.remaining,
        }
      }
      return false
    })

    if (isVerbose) {
      logger.group('overflow', `detectOverflow [${startPos}..${endPos}] — maxH: ${this.geometry.contentHeight}px`, () => {
        for (const row of nodeRows) {
          const mark = row.fits ? '  ✓' : '  ✗ OVERFLOW'
          console.log(
            `%c  pos ${row.pos} ${row.type}%c  h=${row.h.toFixed(1)} mt=${row.mt.toFixed(1)} mb=${row.mb.toFixed(1)}  accumulated=${row.accumulated.toFixed(1)}${mark}`,
            'color: #6b7280',
            '',
            row.el
          )
        }
      })
    }

    return result
  }

  // ── Split handling ─────────────────────────────────────────────────────────

  private handleOverflow(
    view: EditorView,
    overflow: OverflowResult,
    pageMap: PageMap,
    ptx: PaginationTransaction
  ): boolean {
    const { nodePos, nodeType, remainingHeight, pageIndex } = overflow
    const node = view.state.doc.nodeAt(nodePos)
    if (!node) return false

    // ── Paragraph: attempt sub-paragraph split ──
    if (nodeType === 'paragraph' && this.config.splitParagraphs) {
      const domEl = view.nodeDOM(nodePos) as HTMLElement | null
      if (!domEl) {
        logger.log('split', `paragraph at ${nodePos} — no DOM element, moving whole block`)
        ptx.moveToNextPage(nodePos, pageMap)
        return true
      }

      const pageBottom = this.getPageBottomY(view, pageIndex, pageMap)
      const parRect = domEl.getBoundingClientRect()
      logger.log('split', `paragraph at ${nodePos} — el.top: ${parRect.top.toFixed(1)}, el.bottom: ${parRect.bottom.toFixed(1)}, pageBottom: ${pageBottom.toFixed(1)}, overflow: ${(parRect.bottom - pageBottom).toFixed(1)}px`,
        domEl
      )

      const splitResult = this.textFinder.find(domEl, pageBottom)

      if (!splitResult) {
        logger.log('split', `paragraph at ${nodePos} — orphan/widow guard triggered, moving whole block`)
        ptx.moveToNextPage(nodePos, pageMap)
        return true
      }

      logger.log('split', `paragraph at ${nodePos} — splitting at char offset ${splitResult.offset} (head: ${splitResult.headLines} lines, tail: ${splitResult.tailLines} lines, wordBoundary: ${splitResult.adjustedToWordBoundary})`,
        domEl
      )
      const pmPos = this.textFinder.toPmPos(splitResult, view)
      ptx.splitParagraphAt(pmPos, nodePos, node.attrs, pageIndex)
      return true
    }

    // ── Table: attempt row-level split ──
    if (nodeType === 'table' && this.config.splitTables) {
      const domEl = view.nodeDOM(nodePos) as HTMLElement | null
      if (!domEl) {
        logger.log('split', `table at ${nodePos} — no DOM element, moving whole table`)
        ptx.moveToNextPage(nodePos, pageMap)
        return true
      }

      const plan = this.tableFinder.analyze(node, domEl, remainingHeight)
      if (!plan || plan.splitBeforeRow === null) {
        logger.log('split', `table at ${nodePos} — no safe split row (${plan ? 'rowspan conflict' : 'fits'}), moving whole table`,
          domEl
        )
        ptx.moveToNextPage(nodePos, pageMap)
        return true
      }

      // TODO: implement actual table row split transaction
      logger.log('split', `table at ${nodePos} — safe split before row ${plan.splitBeforeRow} (of ${plan.rowHeights.length} rows), table splitting not yet implemented — moving whole table`,
        { rowHeights: plan.rowHeights, unsafeRows: [...plan.unsafeRows] },
        domEl
      )
      ptx.moveToNextPage(nodePos, pageMap)
      return true
    }

    // ── Default: move entire block to next page ──
    const domEl = view.nodeDOM(nodePos) as HTMLElement | null
    logger.log('split', `${nodeType} at ${nodePos} — moving whole block to next page`, domEl ?? '(no DOM)')
    ptx.moveToNextPage(nodePos, pageMap)
    return true
  }

  // ── Pull correction ────────────────────────────────────────────────────────

  private tryPull(
    view: EditorView,
    pageIndex: number,
    pageMap: PageMap,
    ptx: PaginationTransaction
  ): boolean {
    const page = pageMap.getPage(pageIndex)
    const nextPage = pageMap.getPage(pageIndex + 1)
    if (!page || !nextPage) return false

    const firstNodePos = nextPage.startPos
    const firstNodeDOM = view.nodeDOM(firstNodePos) as HTMLElement | null
    if (!firstNodeDOM) return false

    const col = new DomColumnHeight(this.geometry.contentHeight)

    const { doc } = view.state
    doc.nodesBetween(page.startPos, page.endPos, (node, pos) => {
      if (!node.isBlock || node === doc) return true
      const domEl = view.nodeDOM(pos) as HTMLElement | null
      if (domEl) col.tryAddChild(domEl)
      return false
    })

    const peek = col.peekChild(firstNodeDOM)

    logger.log('overflow', `page ${pageIndex} pull check — accumulated: ${col.height.toFixed(1)}px, remaining: ${col.remaining.toFixed(1)}px, candidate h: ${peek.elementHeight.toFixed(1)}px, fits: ${peek.fits}`,
      firstNodeDOM
    )

    if (!peek.fits) return false

    ptx.pullFromNextPage(pageIndex, pageMap)
    return true
  }

  // ── Fusion ────────────────────────────────────────────────────────────────

  private fuseIfNeeded(view: EditorView, pageMap: PageMap, ptx: PaginationTransaction): boolean {
    this.splitRegistry.syncPageIndexes(pageMap)
    const candidates = this.splitRegistry.findFusionCandidates()

    for (const { head, tail } of candidates) {
      const headNode = view.state.doc.nodeAt(head.pos)
      const tailNode = view.state.doc.nodeAt(tail.pos)
      if (!headNode || !tailNode) continue
      ptx.fuseNodes(head.pos, tail.pos)
    }

    return candidates.length > 0
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

      const pageRows: Array<{ pos: number; type: string; key: string; el: HTMLElement; h: number }> = []

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
        logger.group('reflow', `cache: page ${pageIndex} — ${pageRows.length} node(s) measured`, () => {
          for (const row of pageRows) {
            console.log(
              `%c  pos ${row.pos} ${row.type}%c  h=${row.h.toFixed(1)}px  key="${row.key}"`,
              'color: #6b7280', '',
              row.el
            )
          }
        })
      }
    }

    logger.log('reflow', `height cache: ${measured} node(s) measured, total entries: ${heightCache.size}`)
  }

  // ── Geometry helpers ───────────────────────────────────────────────────────

  /**
   * Return the absolute Y coordinate of the bottom of the content area for
   * the given page index.
   *
   * In the flat/decoration model there is no page-body DOM element.
   * We compute: top of first node on the page + contentHeight.
   */
  private getPageBottomY(view: EditorView, pageIndex: number, pageMap: PageMap): number {
    const page = pageMap.getPage(pageIndex)
    if (!page) return Infinity

    const firstNodeDOM = view.nodeDOM(page.startPos) as HTMLElement | null
    if (!firstNodeDOM) return Infinity

    const rect = firstNodeDOM.getBoundingClientRect()
    const pageBottom = rect.top + this.geometry.contentHeight

    logger.log('overflow', `page ${pageIndex} bottom Y — firstNode.top: ${rect.top.toFixed(1)}, contentHeight: ${this.geometry.contentHeight}px, pageBottom: ${pageBottom.toFixed(1)}`,
      firstNodeDOM
    )

    return pageBottom
  }
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
