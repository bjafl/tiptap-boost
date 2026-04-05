import { CSSLength } from './CSSLength'
import { PAGE_SIZES } from '../constants'
import type { PaginationOptions, PageSize, PageMargins } from '../types'

/**
 * Resolves page dimensions and content area from `PaginationOptions`.
 * All values are in CSS pixels.
 *
 * Immutable — use `withOverrides` to derive a modified geometry.
 */
export class PageGeometry {
  readonly pageWidth: number
  readonly pageHeight: number
  readonly contentWidth: number
  readonly contentHeight: number
  readonly margins: { top: number; right: number; bottom: number; left: number }
  readonly headerHeight: number
  readonly footerHeight: number

  constructor(options: PaginationOptions) {
    const { w, h } = resolvePageSize(options.pageSize, options.orientation)

    this.pageWidth = w
    this.pageHeight = h

    this.margins = {
      top: toPx(options.margins.top),
      right: toPx(options.margins.right),
      bottom: toPx(options.margins.bottom),
      left: toPx(options.margins.left),
    }

    this.headerHeight = options.headerHeight
    this.footerHeight = options.footerHeight

    this.contentWidth = this.pageWidth - this.margins.left - this.margins.right
    this.contentHeight =
      this.pageHeight -
      this.margins.top -
      this.margins.bottom -
      this.headerHeight -
      this.footerHeight
  }

  /**
   * Returns a new `PageGeometry` with the given option fields overridden.
   * Useful for first-page or landscape overrides.
   */
  withOverrides(overrides: Partial<PaginationOptions>): PageGeometry {
    return new PageGeometry({ ...this._options, ...overrides })
  }

  // Kept private so callers use the resolved px fields, not raw options.
  private _options!: PaginationOptions

  // static create(options: PaginationOptions): PageGeometry {
  //   const geo = new PageGeometry(options)

  //   geo._options = options
  //   return geo
  // }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPx(value: string | number): number {
  return CSSLength.parse(value).toPx()
}

function resolvePageSize(
  pageSize: PageSize,
  orientation: 'portrait' | 'landscape'
): { w: number; h: number } {
  let w: number
  let h: number

  if (typeof pageSize === 'string') {
    const preset = PAGE_SIZES[pageSize]
    w = toPx(preset.width)
    h = toPx(preset.height)
  } else {
    w = toPx(pageSize.width)
    h = toPx(pageSize.height)
  }

  if (orientation === 'landscape') {
    return { w: h, h: w }
  }
  return { w, h }
}
