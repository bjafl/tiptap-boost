import { CLASS } from '../constants'
import type { PaginationOptions, HeaderFooterContent, HeaderFooterSlot } from '../types'
import type { PageGeometry } from '../utils/PageGeometry'

/**
 * Creates the DOM element for a page-break widget decoration.
 *
 * Structure:
 * ```
 * <div class="tb-page-breaker" data-page-break="N">
 *   <div class="tb-page-spacer" style="height: Xpx">
 *   <div class="tb-page-footer">                      ← 3-col layout, full page width
 *     <div class="tb-page-footer-left">
 *     <div class="tb-page-footer-center">
 *     <div class="tb-page-footer-right">
 *   <div class="tb-page-gap">
 *   <div class="tb-page-header">                      ← 3-col layout, full page width
 *     <div class="tb-page-header-left">
 *     <div class="tb-page-header-center">
 *     <div class="tb-page-header-right">
 * </div>
 * ```
 *
 * Header/footer containers span the full page width (breaking out of content
 * padding via negative margins). Their padding provides spacing relative to
 * page edges and content area. `min-height` equals the corresponding page
 * margin so the space is always reserved even when no content is present.
 */
export function createBreakerWidget(
  pageIndex: number,
  spacerHeight: number,
  totalPages: number,
  options: Pick<PaginationOptions, 'pageGap' | 'headerHeight' | 'footerHeight' | 'header' | 'footer' | 'cssClassPrefix'>,
  geometry: PageGeometry
): HTMLElement {
  const isFirst = pageIndex === 0      // widget before page 1 content (header only)
  const isLast = pageIndex === totalPages // widget after last page content (footer + spacer only)

  const container = document.createElement('div')
  container.className = CLASS.breaker
  container.dataset.pageBreak = String(pageIndex)

  // ── Spacer ────────────────────────────────────────────────────────────────
  if (!isFirst) {
    const spacer = document.createElement('div')
    spacer.className = CLASS.spacer
    spacer.style.height = `${Math.max(0, spacerHeight)}px`
    container.appendChild(spacer)
  }

  // ── Footer for the page ending here ───────────────────────────────────────
  if (!isFirst) {
    // 1-based display index of the page that just ended
    const endingPageIndex = pageIndex
    const footer = buildHeaderFooter(
      CLASS.footer,
      options.footer,
      endingPageIndex,
      totalPages,
      options.footerHeight,
      geometry.margins.bottom,
      geometry.footerMargins.inner,
      geometry.footerMargins.outer,
      geometry.margins.left,
      geometry.margins.right
    )
    footer.dataset.pageIndex = String(pageIndex - 1)
    container.appendChild(footer)
  }

  // ── Gap ───────────────────────────────────────────────────────────────────
  if (!isFirst && !isLast) {
    const gap = document.createElement('div')
    gap.className = CLASS.gap
    container.appendChild(gap)
  }

  // ── Header for the page starting here ────────────────────────────────────
  if (!isLast) {
    const startingPageIndex = pageIndex + 1
    const header = buildHeaderFooter(
      CLASS.header,
      options.header,
      startingPageIndex,
      totalPages,
      options.headerHeight,
      geometry.margins.top,
      geometry.headerMargins.outer,
      geometry.headerMargins.inner,
      geometry.margins.left,
      geometry.margins.right
    )
    header.dataset.pageIndex = String(pageIndex)
    container.appendChild(header)
  }

  return container
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Build a header or footer container with three columns.
 *
 * The container spans the full page width by breaking out of the content
 * area's horizontal padding via negative margins. Vertical padding provides
 * the outer/inner spacing relative to the page edge and content area.
 * `min-height` equals the corresponding page margin so the space is reserved
 * even when no content and no explicit height is set.
 *
 * @param className       CSS class for the container (CLASS.header / CLASS.footer)
 * @param content         Three-column slot content (or null for empty)
 * @param pageNumber      1-based page number (passed to slot functions)
 * @param totalPages      Total pages (passed to slot functions)
 * @param extraHeight     Extra reserved height beyond the page margin (options.headerHeight / footerHeight)
 * @param pageMargin      Page top/bottom margin in px (used for min-height baseline)
 * @param paddingTop      Padding-top of the container in px
 * @param paddingBottom   Padding-bottom of the container in px
 * @param marginLeft      Page left margin — used to break out of content padding
 * @param marginRight     Page right margin — used to break out of content padding
 */
function buildHeaderFooter(
  className: string,
  content: HeaderFooterContent | null,
  pageNumber: number,
  totalPages: number,
  extraHeight: number,
  pageMargin: number,
  paddingTop: number,
  paddingBottom: number,
  marginLeft: number,
  marginRight: number
): HTMLElement {
  const el = document.createElement('div')
  el.className = className

  // Break out of the content area's horizontal padding so the container
  // spans the full page width.
  el.style.marginLeft = `${-marginLeft}px`
  el.style.marginRight = `${-marginRight}px`

  // Vertical padding provides spacing from page edge and content area.
  el.style.paddingTop = `${paddingTop}px`
  el.style.paddingBottom = `${paddingBottom}px`

  // Always reserve at least the page margin height (plus any extra).
  el.style.minHeight = `${pageMargin + extraHeight}px`

  if (extraHeight > 0) {
    el.style.height = `${pageMargin + extraHeight}px`
  }

  // Three columns — only create if at least one slot has content.
  if (content && (content.left != null || content.center != null || content.right != null)) {
    const cols = document.createElement('div')
    cols.className = `${className}-cols`

    appendSlot(cols, `${className}-left`, content.left, pageNumber, totalPages)
    appendSlot(cols, `${className}-center`, content.center, pageNumber, totalPages)
    appendSlot(cols, `${className}-right`, content.right, pageNumber, totalPages)

    el.appendChild(cols)
  }

  return el
}

function appendSlot(
  parent: HTMLElement,
  className: string,
  slot: HeaderFooterSlot | undefined,
  pageNumber: number,
  totalPages: number
): void {
  const col = document.createElement('div')
  col.className = className

  if (slot != null) {
    const html = typeof slot === 'function' ? slot(pageNumber, totalPages) : slot
    col.innerHTML = html
  }

  parent.appendChild(col)
}
