import type { PageGeometry } from './PageGeometry'
import type { PaginationOptions } from '../types'

/**
 * Syncs page geometry CSS variables onto the editor's DOM element.
 *
 * Variables are set on the element itself so they cascade to all child
 * elements without global stylesheet pollution.
 *
 * Variables set:
 *   --tb-page-width            total page width in px
 *   --tb-page-height           total page height in px
 *   --tb-page-margin-top       top margin in px
 *   --tb-page-margin-right     right margin in px
 *   --tb-page-margin-bottom    bottom margin in px
 *   --tb-page-margin-left      left margin in px
 *   --tb-page-content-width    available content width in px
 *   --tb-page-content-height   available content height in px
 *   --tb-page-gap              gap between pages in px
 *   --tb-page-count            total page count (integer)
 *
 * The prefix `tb-page` is replaced with `options.cssClassPrefix` if set.
 */
export function syncCssVars(
  el: HTMLElement,
  geometry: PageGeometry,
  options: Pick<PaginationOptions, 'pageGap' | 'cssClassPrefix'>,
  pageCount: number
): void {
  const p = options.cssClassPrefix

  el.style.setProperty(`--${p}-width`, px(geometry.pageWidth))
  el.style.setProperty(`--${p}-height`, px(geometry.pageHeight))
  el.style.setProperty(`--${p}-margin-top`, px(geometry.margins.top))
  el.style.setProperty(`--${p}-margin-right`, px(geometry.margins.right))
  el.style.setProperty(`--${p}-margin-bottom`, px(geometry.margins.bottom))
  el.style.setProperty(`--${p}-margin-left`, px(geometry.margins.left))
  el.style.setProperty(`--${p}-content-width`, px(geometry.contentWidth))
  el.style.setProperty(`--${p}-content-height`, px(geometry.contentHeight))
  el.style.setProperty(`--${p}-gap`, px(options.pageGap))
  el.style.setProperty(`--${p}-count`, String(pageCount))
}

/**
 * Removes all page CSS variables from the element.
 * Call on extension destroy.
 */
export function clearCssVars(
  el: HTMLElement,
  options: Pick<PaginationOptions, 'cssClassPrefix'>
): void {
  const p = options.cssClassPrefix
  const keys = [
    'width', 'height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'content-width', 'content-height',
    'gap', 'count',
  ]
  for (const key of keys) {
    el.style.removeProperty(`--${p}-${key}`)
  }
}

/**
 * Update only the page count variable (called by plugin after reflow).
 */
export function updatePageCount(
  el: HTMLElement,
  options: Pick<PaginationOptions, 'cssClassPrefix'>,
  pageCount: number
): void {
  el.style.setProperty(`--${options.cssClassPrefix}-count`, String(pageCount))
}

function px(value: number): string {
  return `${value}px`
}
