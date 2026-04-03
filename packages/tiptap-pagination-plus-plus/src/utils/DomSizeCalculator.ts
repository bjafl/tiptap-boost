/**
 * Tracks the accumulated height of a column of block elements, including
 * CSS margin collapsing between adjacent siblings.
 */
export class DomColumnHeight {
  private childBottomMargins: number[] = []
  private _height: number = 0
  private maxContentHeight: number

  constructor(maxContentHeight: number) {
    this.maxContentHeight = maxContentHeight
  }

  get height(): number {
    return this._height
  }

  get remaining(): number {
    return this.maxContentHeight - this._height
  }

  /**
   * Attempts to add `el` to the column. Returns true and updates the
   * accumulated height if the element fits; returns false otherwise.
   */
  tryAddChild(el: HTMLElement): boolean {
    const height = el.getBoundingClientRect().height
    const style = getComputedStyle(el)
    const marginTop = parseFloat(style.marginTop) || 0
    const marginBottom = parseFloat(style.marginBottom) || 0

    const newHeight = this.calculateNewHeight(height, marginTop, marginBottom)
    if (newHeight > this.maxContentHeight) return false

    this._height = newHeight
    this.childBottomMargins.push(marginBottom)
    return true
  }

  private calculateNewHeight(height: number, marginTop: number, marginBottom: number): number {
    if (this.childBottomMargins.length === 0) {
      return height + marginTop + marginBottom
    }
    const prevMarginBottom = this.childBottomMargins[this.childBottomMargins.length - 1]
    // CSS margin collapsing: the larger of the two adjacent margins wins.
    const collapsedMargin = Math.max(prevMarginBottom, marginTop) - prevMarginBottom
    return this._height + collapsedMargin + height + marginBottom
  }
}
