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
  options: Pick<
    PaginationOptions,
    'pageGap' | 'headerHeight' | 'footerHeight' | 'header' | 'footer' | 'cssClassPrefix'
  >,
  geometry: PageGeometry
): HTMLElement {
  const isFirst = pageIndex === 0 // widget before page 1 content (header only)
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
      'footer',
      options.footer,
      endingPageIndex,
      totalPages,
      options.footerHeight,
      geometry
    )
    footer.dataset.pageIndex = String(pageIndex - 1)
    container.appendChild(footer)
    // apply inner margin to container so it collapses with page margin
    //TODO: correct when spacer? we subtract margin from minheight of footer..
    container.style.marginTop = `${geometry.footerMargins.inner}px`
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
      'header',
      options.header,
      startingPageIndex,
      totalPages,
      options.headerHeight,
      geometry
    )
    header.dataset.pageIndex = String(pageIndex)
    container.appendChild(header)
    // apply inner margin to container so it collapses with page margin
    container.style.marginBottom = `${geometry.headerMargins.inner}px`
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
  type: 'header' | 'footer',
  content: HeaderFooterContent | null,
  pageNumber: number,
  totalPages: number,
  extraHeight: number,
  geometry: PageGeometry
): HTMLElement {
  const el = document.createElement('div')
  const className = type === 'header' ? CLASS.header : CLASS.footer
  const innerMargins =
    type === 'header' ? geometry.headerMargins.inner : geometry.footerMargins.inner
  const outerMargins =
    type === 'header' ? geometry.headerMargins.outer : geometry.footerMargins.outer
  el.className = className

  // Vertical padding provides spacing from page edge and content area.
  if (type === 'header') {
    el.style.paddingTop = `${outerMargins}px`
    // el.style.marginBottom = `${innerMargins}px`
  } else {
    // el.style.marginTop = `${innerMargins}px`
    el.style.paddingBottom = `${outerMargins}px`
  }
  // Horizontal padding
  el.style.paddingLeft = `${outerMargins}px`
  el.style.paddingRight = `${outerMargins}px`

  // Always reserve at least the page margin height (collapsing inner margins)
  el.style.minHeight = `${geometry.margins.top - innerMargins}px`

  if (extraHeight > 0) {
    //TODO: Check..
    el.style.height = `${geometry.margins.top + geometry.headerMargins.outer}px`
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
