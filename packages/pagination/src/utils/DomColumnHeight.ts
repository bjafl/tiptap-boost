import { PageGeometry } from './PageGeometry'

/**
 * Tracks the accumulated height of a column of block elements, including
 * CSS margin collapsing between adjacent siblings.
 *
 * Designed for use in a pagination loop:
 *
 * ```ts
 * const col = new DomColumnHeight(pageBodyHeight)
 * for (const el of blockElements) {
 *   if (!col.tryAddChild(el)) {
 *     // el overflows — split or move to next page
 *     const info = col.peekChild(el)
 *     // info.remaining = space left for sub-paragraph splitting
 *     break
 *   }
 * }
 * col.reset() // ready for next page
 * ```
 */
export class DomColumnHeight {
  private lastBottomMargin?: number
  private count: number = 0
  private _heightExclMb: number = 0 // height excluding the last bottom margin (for accurate projection of next element)
  private maxContentHeight: number
  private contextMarginTop: number
  private contextMarginBottom: number
  private domComputationCache: WeakMap<
    HTMLElement,
    { rect?: DOMRect; style?: CSSStyleDeclaration }
  > = new WeakMap()

  /**
   * @param maxContentHeight  Available height in the page body.
   *   Should account for page-body padding if the body establishes
   *   a BFC (overflow: hidden, display: flow-root, etc.).
   */
  constructor(maxContentHeight: number, contextMarginTop: number, contextMarginBottom: number) {
    this.maxContentHeight = maxContentHeight
    this.contextMarginTop = contextMarginTop
    this.contextMarginBottom = contextMarginBottom
  }
  static fromPageGeometry(config: PageGeometry) {
    return new DomColumnHeight(
      config.contentHeight,
      config.headerMargins.inner,
      config.footerMargins.inner
    )
  }

  /** Current accumulated height including margins. */
  get height(): number {
    return this._heightExclMb + this.collapsedMarginBottom(this.lastBottomMargin ?? 0)
  }

  /** Space remaining before overflow. */
  get remaining(): number {
    return this.maxContentHeight - this.height
  }

  /** Number of children added so far. */
  get childCount(): number {
    return this.count
  }

  /** Whether no children have been added yet. */
  get isEmpty(): boolean {
    return this.count === 0
  }

  flushCache(): void {
    this.domComputationCache = new WeakMap()
  }

  /**
   * Reset for reuse on the next page.
   * Optionally update maxContentHeight (e.g. if pages have different sizes).
   */
  reset(maxContentHeight?: number, margins: { top?: number; bottom?: number } = {}): void {
    this.lastBottomMargin = undefined
    this.count = 0
    this._heightExclMb = 0
    if (maxContentHeight !== undefined) {
      this.maxContentHeight = maxContentHeight
    }
    const { top, bottom } = margins
    if (top !== undefined) {
      this.contextMarginTop = top
    }
    if (bottom !== undefined) {
      this.contextMarginBottom = bottom
    }
    this.flushCache()
  }

  /**
   * Attempts to add an element to the column.
   * Returns `true` and updates accumulated height if it fits.
   *
   * Accepts either an HTMLElement (measures automatically) or
   * pre-computed values to avoid redundant `getComputedStyle` calls.
   */
  tryAddChild(el: HTMLElement): { fits: boolean; height: number; mt: number; mb: number }
  tryAddChild(
    height: number,
    marginTop: number,
    marginBottom: number
  ): { fits: boolean; height: number; mt: number; mb: number }
  tryAddChild(
    elOrHeight: HTMLElement | number,
    marginTop?: number,
    marginBottom?: number
  ): { fits: boolean; height: number; mt: number; mb: number } {
    const { height, mt, mb } = this.resolveMetrics(elOrHeight, marginTop, marginBottom)
    const { newHeight, newHeightExclMb } = this.projectAddingChild(height, mt, mb)

    if (newHeight > this.maxContentHeight) {
      return { fits: false, height, mt, mb }
    }

    this._heightExclMb = newHeightExclMb
    this.lastBottomMargin = mb
    this.count++
    return { fits: true, height, mt, mb }
  }

  /**
   * Check whether an element would fit without mutating state.
   * Returns measurement details useful for sub-paragraph splitting.
   */
  peekChild(el: HTMLElement): PeekResult
  peekChild(height: number, marginTop: number, marginBottom: number): PeekResult
  peekChild(
    elOrHeight: HTMLElement | number,
    marginTop?: number,
    marginBottom?: number
  ): PeekResult {
    const { height, mt, mb } = this.resolveMetrics(elOrHeight, marginTop, marginBottom)
    const { newHeight, estimatedRemaining, maxHeightForChild } = this.projectAddingChild(
      height,
      mt,
      mb
    )
    return {
      fits: newHeight <= this.maxContentHeight,
      projectedHeight: newHeight,
      elementHeight: height,
      estimatedRemainingBlockHeight: estimatedRemaining,
      maxHeightForChild,
      gapSize: Math.max(mt, mb),
    }
  }

  /**
   * Get the maximum bottom DOM coordinate for an element, that would fit in the column.
   */
  findMaxBottomForElement(el: HTMLElement): number {
    const { rect } = this.getComputed(el)
    const { maxHeightForChild } = this.peekChild(el)
    return rect.top + maxHeightForChild
  }

  /*
   * Get computed metrics for an element.
   * Uses a cache to avoid redundant `getBoundingClientRect` and `getComputedStyle` calls
   * Defaults to compute both rect and style if not cached, but can be configured with opts.
   */
  getComputed(el: HTMLElement): { rect: DOMRect; style: CSSStyleDeclaration }
  getComputed(
    el: HTMLElement,
    opts: { rect: true; style?: boolean }
  ): { rect: DOMRect; style?: CSSStyleDeclaration }
  getComputed(
    el: HTMLElement,
    opts: { rect?: boolean; style: true }
  ): { rect?: DOMRect; style: CSSStyleDeclaration }
  getComputed(
    el: HTMLElement,
    opts: { rect?: boolean; style?: boolean } = {}
  ): { rect?: DOMRect; style?: CSSStyleDeclaration } {
    const { rect: getRect = true, style: getStyle = true } = opts
    let { rect, style } = this.domComputationCache.get(el) || {}
    if (getRect && !rect) {
      rect = el.getBoundingClientRect()
      this.domComputationCache.set(el, { rect })
    }
    if (getStyle && !style) {
      style = getComputedStyle(el)
      this.domComputationCache.set(el, { style })
    }
    return { rect, style }
  }

  /**
   * Make a projection for adding an element with the given height and margins, without mutating state.
   */
  private projectAddingChild(height: number, marginTop: number, marginBottom: number) {
    const collapsedMt = this.collapsedMarginTop(marginTop)
    const collapsedMb = this.collapsedMarginBottom(marginBottom)
    const newHeightExclMb = this._heightExclMb + height + collapsedMt
    const newHeight = newHeightExclMb + collapsedMb
    const maxHeightForChild = this.maxContentHeight - newHeight + height
    const estimatedRemaining = this.maxContentHeight - newHeightExclMb - collapsedMt - collapsedMb
    return {
      collapsedMt,
      collapsedMb,
      newHeightExclMb,
      newHeight,
      maxHeightForChild,
      estimatedRemaining,
    }
  }

  /**
   * Collapsed margin top height, if adding  an element with given margin size.
   * Resulting height is the gap that should be counted towards the column height.
   *
   * For first column child, margin collapses against the context margin (e.g. page padding).
   * Then it may collapse to zero, as the height will not be relevant for column height.
   * Else it collapses against previous sibling's bottom margin, and the larger one wins.
   */
  private collapsedMarginTop(marginTop: number): number {
    if (this.lastBottomMargin === undefined) {
      return Math.max(marginTop - this.contextMarginTop, 0)
    }
    return Math.max(marginTop, this.lastBottomMargin)
  }

  /**
   * Collapsed margin bottom height, if adding  an element with given margin size.
   * Resulting height is the gap that should be counted towards the column height.
   *
   * Bottom margin of last child collapses against the context margin (e.g. page padding).
   * Result may collapse to zero, as the height will not be relevant for column height.
   */
  private collapsedMarginBottom(marginBottom: number): number {
    return Math.max(marginBottom - this.contextMarginBottom, 0)
  }

  /**
   * Convenience for total extra gap space counted towards column height,
   * if adding an element with the given margins.
   *
   * Returns sum of collapsed top and bottom margins
   * calculated with collapseMarginTop and collapsedMarginBottom.
   */
  private collapsedMarginsHeight(marginTop: number, marginBottom: number): number {
    const mt = this.collapsedMarginTop(marginTop)
    const mb = this.collapsedMarginBottom(marginBottom)
    return mt + mb
  }

  /**
   * Normalize input: either measure an HTMLElement or pass through
   * pre-computed values.
   */
  private resolveMetrics(
    elOrHeight: HTMLElement | number,
    marginTop?: number,
    marginBottom?: number
  ): { height: number; mt: number; mb: number } {
    if (typeof elOrHeight === 'number') {
      return {
        height: elOrHeight,
        mt: marginTop ?? 0,
        mb: marginBottom ?? 0,
      }
    }
    const { rect, style } = this.getComputed(elOrHeight)

    return {
      height: rect.height,
      mt: parseFloat(style.marginTop) || 0,
      mb: parseFloat(style.marginBottom) || 0,
    }
  }
}

export type PeekResult = {
  /** Whether the element would fit within maxContentHeight. */
  fits: boolean
  /** What accumulated height would be after adding this element. */
  projectedHeight: number
  /** The element's own height (from getBoundingClientRect). */
  elementHeight: number
  /** Block height remaining after adding this element (negative if overflow).
   *  Assumes block with same margins as peeked element.
   */
  estimatedRemainingBlockHeight: number
  /** Max height for the peeked element that would fit in the column. */
  maxHeightForChild: number
  /** Gap that would be added between elements with same margins as peeked element. */
  gapSize: number
}
