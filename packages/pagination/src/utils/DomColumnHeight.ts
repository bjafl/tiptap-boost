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
  private lastBottomMargin: number = 0
  private count: number = 0
  private _height: number = 0
  private maxContentHeight: number

  /**
   * @param maxContentHeight  Available height in the page body.
   *   Should account for page-body padding if the body establishes
   *   a BFC (overflow: hidden, display: flow-root, etc.).
   */
  constructor(maxContentHeight: number) {
    this.maxContentHeight = maxContentHeight
  }

  /** Current accumulated height including margins. */
  get height(): number {
    return this._height
  }

  /** Space remaining before overflow. */
  get remaining(): number {
    return this.maxContentHeight - this._height
  }

  /** Number of children added so far. */
  get childCount(): number {
    return this.count
  }

  /** Whether no children have been added yet. */
  get isEmpty(): boolean {
    return this.count === 0
  }

  /**
   * Reset for reuse on the next page.
   * Optionally update maxContentHeight (e.g. if pages have different sizes).
   */
  reset(maxContentHeight?: number): void {
    this.lastBottomMargin = 0
    this.count = 0
    this._height = 0
    if (maxContentHeight !== undefined) {
      this.maxContentHeight = maxContentHeight
    }
  }

  /**
   * Attempts to add an element to the column.
   * Returns `true` and updates accumulated height if it fits.
   *
   * Accepts either an HTMLElement (measures automatically) or
   * pre-computed values to avoid redundant `getComputedStyle` calls.
   */
  tryAddChild(el: HTMLElement): boolean
  tryAddChild(height: number, marginTop: number, marginBottom: number): boolean
  tryAddChild(
    elOrHeight: HTMLElement | number,
    marginTop?: number,
    marginBottom?: number
  ): boolean {
    const { height, mt, mb } = this.resolveMetrics(elOrHeight, marginTop, marginBottom)
    const newHeight = this.projectHeight(height, mt, mb)

    if (newHeight > this.maxContentHeight) return false

    this._height = newHeight
    this.lastBottomMargin = mb
    this.count++
    return true
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
    const newHeight = this.projectHeight(height, mt, mb)

    return {
      fits: newHeight <= this.maxContentHeight,
      projectedHeight: newHeight,
      elementHeight: height,
      remaining: this.maxContentHeight - newHeight,
      collapsedGap: this.collapsedGap(mt),
    }
  }

  /**
   * Compute what the accumulated height would be if an element
   * with the given metrics were added.
   */
  private projectHeight(height: number, marginTop: number, marginBottom: number): number {
    if (this.count === 0) {
      // First child: marginTop counts against the top of the container.
      // This assumes the container establishes a BFC (overflow: hidden,
      // display: flow-root, etc.) so marginTop does NOT collapse with
      // the container. If your container does not establish a BFC,
      // drop marginTop here.
      return marginTop + height + marginBottom
    }

    const gap = this.collapsedGap(marginTop)
    return this._height + gap + height + marginBottom
  }

  /**
   * Collapsed margin gap between the last child's bottom margin
   * and a new child's top margin.
   *
   * CSS margin collapsing: the larger of the two adjacent margins wins.
   * Since lastBottomMargin is already accounted for in _height,
   * we only add the difference (if marginTop is larger).
   */
  private collapsedGap(marginTop: number): number {
    return Math.max(marginTop - this.lastBottomMargin, 0)
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

    const rect = elOrHeight.getBoundingClientRect()
    const style = getComputedStyle(elOrHeight)

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
  /** Space remaining after adding this element (negative if overflow). */
  remaining: number
  /** The actual gap that would be added between this and the previous element. */
  collapsedGap: number
}
