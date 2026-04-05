import { CSSLength } from './CSSLength'
import { PAGE_SIZES } from '../constants'
import type { PaginationOptions, PageSize } from '../types'

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
  /** Resolved padding values for the header container (px). */
  readonly headerMargins: { outer: number; inner: number }
  /** Resolved padding values for the footer container (px). */
  readonly footerMargins: { outer: number; inner: number }

  constructor(options: PaginationOptions) {
    const { w, h } = resolvePageSize(options.pageSize, options.orientation)

    this.pageWidth = w
    this.pageHeight = h

    this.margins = {
      top: CSSLength.toPx(options.margins.top),
      right: CSSLength.toPx(options.margins.right),
      bottom: CSSLength.toPx(options.margins.bottom),
      left: CSSLength.toPx(options.margins.left),
    }

    this.headerMargins = {
      outer: CSSLength.toPx(options.headerMarginOuter),
      inner: CSSLength.toPx(options.headerMarginInner),
    }
    this.footerMargins = {
      outer: CSSLength.toPx(options.footerMarginOuter),
      inner: CSSLength.toPx(options.footerMarginInner),
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

function resolvePageSize(
  pageSize: PageSize,
  orientation: 'portrait' | 'landscape'
): { w: number; h: number } {
  let w: number
  let h: number

  if (typeof pageSize === 'string') {
    const preset = PAGE_SIZES[pageSize]
    w = CSSLength.toPx(preset.width)
    h = CSSLength.toPx(preset.height)
  } else {
    w = CSSLength.toPx(pageSize.width)
    h = CSSLength.toPx(pageSize.height)
  }

  if (orientation === 'landscape') {
    return { w: h, h: w }
  }
  return { w, h }
}
