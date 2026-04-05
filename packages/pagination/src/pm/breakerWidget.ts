import { CLASS } from '../constants'
import type { PaginationOptions } from '../types'

/**
 * Creates the DOM element for a page-break widget decoration.
 *
 * Structure:
 * ```
 * <div class="tb-page-breaker" data-page-break="N">
 *   <div class="tb-page-spacer" style="height: Xpx">     ← fills remaining page height
 *   <div class="tb-page-footer" style="height: Xpx">     ← footer for the ending page
 *   <div class="tb-page-gap">                            ← visual gap between pages
 *   <div class="tb-page-header" style="height: Xpx">     ← header for the starting page
 * </div>
 * ```
 *
 * - `spacerHeight` is `contentHeight - accumulatedContentHeight` for that page.
 * - Footer is omitted on the very first widget (before page 1 content).
 * - Gap is omitted on first and last widget.
 * - Header is omitted on the last widget (after final page content).
 */
export function createBreakerWidget(
  pageIndex: number,
  spacerHeight: number,
  totalPages: number,
  options: Pick<PaginationOptions, 'pageGap' | 'headerHeight' | 'footerHeight' | 'cssClassPrefix'>
): HTMLElement {
  const isFirst = pageIndex === 0   // widget before page 1 content (header only)
  const isLast = pageIndex === totalPages // widget after last page content (footer + spacer only)

  const container = document.createElement('div')
  container.className = CLASS.breaker
  container.dataset.pageBreak = String(pageIndex)

  // Spacer — always present except on the first widget (no content above yet)
  if (!isFirst) {
    const spacer = document.createElement('div')
    spacer.className = CLASS.spacer
    spacer.style.height = `${Math.max(0, spacerHeight)}px`
    container.appendChild(spacer)
  }

  // Footer for the page ending here
  if (!isFirst && options.footerHeight > 0) {
    const footer = document.createElement('div')
    footer.className = CLASS.footer
    footer.style.height = `${options.footerHeight}px`
    footer.dataset.pageIndex = String(pageIndex - 1)
    container.appendChild(footer)
  }

  // Gap between pages
  if (!isFirst && !isLast) {
    const gap = document.createElement('div')
    gap.className = CLASS.gap
    container.appendChild(gap)
  }

  // Header for the page starting here
  if (!isLast && options.headerHeight > 0) {
    const header = document.createElement('div')
    header.className = CLASS.header
    header.style.height = `${options.headerHeight}px`
    header.dataset.pageIndex = String(pageIndex)
    container.appendChild(header)
  }

  return container
}
