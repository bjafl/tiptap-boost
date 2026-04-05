import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { PageMap } from './PageMap'
import type { PageGeometry } from '../utils/PageGeometry'
import type { PaginationOptions } from '../types'
import { DomColumnHeight } from '../utils/DomColumnHeight'
import { createBreakerWidget } from './breakerWidget'
import { logger } from '../utils/logger'

/**
 * Build a `DecorationSet` of page-break widgets from the current `PageMap`.
 *
 * Widget layout:
 *   - pos 0: first-page header widget (pageIndex = 0)
 *   - after each page.endPos: breaker widget (spacer + footer + gap + header)
 *   - after last page.endPos: final footer widget (no gap, no header)
 *
 * The spacer height for each breaker is measured from the DOM if an
 * `EditorView` is provided (via `accumulatedHeights`), otherwise estimated
 * from the page content range.
 *
 * @param doc                The PM document
 * @param pageMap            Current page boundaries
 * @param geometry           Resolved page geometry
 * @param options            Extension options (for header/footer heights, gap, prefix)
 * @param accumulatedHeights Pre-measured content heights per page (from DOM).
 *                           If omitted, heights are estimated.
 */
export function buildDecorations(
  doc: PMNode,
  pageMap: PageMap,
  geometry: PageGeometry,
  options: Pick<PaginationOptions, 'pageGap' | 'headerHeight' | 'footerHeight' | 'cssClassPrefix'>,
  accumulatedHeights?: Map<number, number>
): DecorationSet {
  const pages = pageMap.allPages()
  const totalPages = pages.length
  const decorations: Decoration[] = []

  logger.log('deco', `building decorations for ${totalPages} page(s)`, { fromDOM: !!accumulatedHeights })

  // ── First-page header at position 0 ───────────────────────────────────────
  decorations.push(
    Decoration.widget(
      0,
      () =>
        createBreakerWidget(0, 0, totalPages, options),
      { side: -1, key: 'page-header-0' }
    )
  )

  // ── Breaker after each page ────────────────────────────────────────────────
  for (const page of pages) {
    const contentHeight =
      accumulatedHeights?.get(page.pageIndex) ?? estimatePageContentHeight(doc, page.startPos, page.endPos)

    const spacerHeight = geometry.contentHeight - contentHeight
    logger.log('deco', `page ${page.pageIndex}: contentHeight=${contentHeight.toFixed(1)}px, spacer=${spacerHeight.toFixed(1)}px [${page.startPos}..${page.endPos}]`)

    // The widget is placed after the last node on this page.
    // `side: 1` means it renders after any content at the same position.
    decorations.push(
      Decoration.widget(
        page.endPos,
        () => createBreakerWidget(page.pageIndex + 1, spacerHeight, totalPages, options),
        { side: 1, key: `page-break-${page.pageIndex}` }
      )
    )
  }

  return DecorationSet.create(doc, decorations)
}

// ── Height estimation (no DOM) ─────────────────────────────────────────────

const FALLBACK_LINE_HEIGHT = 24
const CHARS_PER_LINE = 80

function estimatePageContentHeight(doc: PMNode, startPos: number, endPos: number): number {
  const col = new DomColumnHeight(Infinity)

  doc.nodesBetween(startPos, endPos, (node, _pos, _parent, index) => {
    if (!node.isBlock || node.isInline) return false
    const h = estimateNodeHeight(node)
    col.tryAddChild(h, 0, 0)
    return false // don't recurse into children
  })

  return col.height
}

function estimateNodeHeight(node: PMNode): number {
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
