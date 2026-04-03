export type Point = { x: number; y: number }

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}
export type RectBoxType = 'content' | 'padding' | 'border' | 'margin' // inclusive
export type Side = 'top' | 'bottom' | 'left' | 'right'
interface BoxFlags {
  margin?: Side[]
  border?: Side[]
  padding?: Side[]
}

export interface RectWithMeta extends Rect {
  boxType: RectBoxType
  margin: Record<Side, number>
  padding: Record<Side, number>
  borderWidth: Record<Side, number>
}

export function getClientRect(el: HTMLElement, boxType: RectBoxType = 'border'): RectWithMeta {
  const elRect = el.getBoundingClientRect()
  const style = getComputedStyle(el)
  const margin = {
    left: parseFloat(style.marginLeft) || 0,
    top: parseFloat(style.marginTop) || 0,
    right: parseFloat(style.marginRight) || 0,
    bottom: parseFloat(style.marginBottom) || 0,
  }
  const borderWidth = {
    left: parseFloat(style.borderLeftWidth) || 0,
    top: parseFloat(style.borderTopWidth) || 0,
    right: parseFloat(style.borderRightWidth) || 0,
    bottom: parseFloat(style.borderBottomWidth) || 0,
  }
  const padding = {
    left: parseFloat(style.paddingLeft) || 0,
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
  }
  const meta = {
    boxType,
    margin,
    borderWidth,
    padding,
  }
  if (boxType === 'border') {
    return { x: elRect.x, y: elRect.y, width: elRect.width, height: elRect.height, ...meta }
  }
  if (boxType === 'margin') {
    return {
      x: elRect.x - margin.left,
      y: elRect.y - margin.top,
      width: elRect.width + margin.left + margin.right,
      height: elRect.height + margin.top + margin.bottom,
      ...meta,
    }
  }
  if (boxType === 'padding') {
    return {
      x: elRect.x + borderWidth.left,
      y: elRect.y + borderWidth.top,
      width: elRect.width - borderWidth.left - borderWidth.right,
      height: elRect.height - borderWidth.top - borderWidth.bottom,
      ...meta,
    }
  }
  // content box
  return {
    x: elRect.x + borderWidth.left + padding.left,
    y: elRect.y + borderWidth.top + padding.top,
    width: elRect.width - borderWidth.left - borderWidth.right - padding.left - padding.right,
    height: elRect.height - borderWidth.top - borderWidth.bottom - padding.top - padding.bottom,
    ...meta,
  }
}

export class DomSizeCalculator {
  private relativeToNode?: HTMLElement
  private relativeOffset?: Point

  constructor(relativeToNode?: HTMLElement, relativeOriginBox: RectBoxType = 'content') {
    this.relativeToNode = relativeToNode
    if (relativeToNode) {
      const { x, y } = this.getRectDom(relativeToNode, relativeOriginBox)
      this.relativeOffset = { x, y }
    } else {
      this.relativeOffset = undefined
    }
  }

  private getRectDom(
    el: HTMLElement,
    boxType: RectBoxType = 'border',
    opts?: {
      // sizeIgnore?: BoxFlags, //TODO
    }
  ): Rect {
    const elRect = el.getBoundingClientRect()
    if (boxType === 'border') {
      return { x: elRect.x, y: elRect.y, width: elRect.width, height: elRect.height }
    }
    const style = getComputedStyle(el)
    if (boxType === 'margin') {
      const margin = {
        left: parseFloat(style.marginLeft) || 0,
        top: parseFloat(style.marginTop) || 0,
        right: parseFloat(style.marginRight) || 0,
        bottom: parseFloat(style.marginBottom) || 0,
      }
      // const marginSize = {...margin}
      // opts?.sizeIgnore?.margin?.forEach((side) => {
      //   marginSize[side] = 0
      // })
      // return {
      //   x: elRect.x - margin.left,
      //   y: elRect.y - margin.top,
      //   width: elRect.width + marginSize.left + marginSize.right,
      //   height: elRect.height + marginSize.top + marginSize.bottom,
      // }
      return {
        x: elRect.x - margin.left,
        y: elRect.y - margin.top,
        width: elRect.width + margin.left + margin.right,
        height: elRect.height + margin.top + margin.bottom,
      }
    }
    const border = {
      left: parseFloat(style.borderLeftWidth) || 0,
      top: parseFloat(style.borderTopWidth) || 0,
      right: parseFloat(style.borderRightWidth) || 0,
      bottom: parseFloat(style.borderBottomWidth) || 0,
    }
    if (boxType === 'padding') {
      return {
        x: elRect.x + border.left,
        y: elRect.y + border.top,
        width: elRect.width - border.left - border.right,
        height: elRect.height - border.top - border.bottom,
      }
    }
    // content box
    const padding = {
      left: parseFloat(style.paddingLeft) || 0,
      top: parseFloat(style.paddingTop) || 0,
      right: parseFloat(style.paddingRight) || 0,
      bottom: parseFloat(style.paddingBottom) || 0,
    }
    return {
      x: elRect.x + border.left + padding.left,
      y: elRect.y + border.top + padding.top,
      width: elRect.width - border.left - border.right - padding.left - padding.right,
      height: elRect.height - border.top - border.bottom - padding.top - padding.bottom,
    }
  }
  private offsetRelative(rect: Rect): Rect {
    if (!this.relativeOffset) return rect
    return {
      x: rect.x - this.relativeOffset.x,
      y: rect.y - this.relativeOffset.y,
      width: rect.width,
      height: rect.height,
    }
  }

  get relativeTo() {
    return this.relativeToNode
  }

  get relativeOrigin() {
    return this.relativeOffset
  }

  getRect(el: HTMLElement, boxType: RectBoxType = 'border', relative = true): Rect {
    const rect = this.getRectDom(el, boxType)
    return relative ? this.offsetRelative(rect) : rect
  }

  getBottom(el: HTMLElement, includeMarginLastBottom = false): number {
    const rect = this.getRect(el, 'margin')
    if (!includeMarginLastBottom) {
      const marginLastBottom = parseFloat(getComputedStyle(el).marginBottom) || 0
      rect.height -= marginLastBottom
    }
    return rect.y + rect.height
  }

  getHeight(firstEl: HTMLElement, lastEl?: HTMLElement, includeMarginLastBottom = true) {
    const firstRect = this.getRect(firstEl, 'margin', false)
    const lastRect = lastEl ? this.getRect(lastEl, 'margin', false) : { ...firstRect }
    if (!includeMarginLastBottom) {
      const marginLastBottom = parseFloat(getComputedStyle(lastEl!).marginBottom) || 0
      lastRect.height -= marginLastBottom
    }
    const top = firstRect.y
    const bottom = lastRect.y + lastRect.height
    return bottom - top
  }
}

export class DomColumnHeight {
  private children: HTMLElement[] = []
  // private childSizes: RectWithMeta[]
  private childBottomMargins: number[] = []
  private _height: number = 0
  private maxContentHeight: number

  constructor(maxContentHeight: number) {
    this.maxContentHeight = maxContentHeight
  }

  private getHeight(el: HTMLElement): { height: number; margin: { top: number; bottom: number } } {
    const style = getComputedStyle(el)
    const height = el.getBoundingClientRect().height
    const marginTop = parseFloat(style.marginTop) || 0
    const marginBottom = parseFloat(style.marginBottom) || 0
    return { height, margin: { top: marginTop, bottom: marginBottom } }
  }

  // private calculateHeight(nodeSizes: RectWithMeta[], ignoreFirstElHeight = false) {
  //   if (nodeSizes.length === 0) return 0
  //   if (ignoreFirstElHeight) {
  //     nodeSizes[0].height = 0
  //     nodeSizes[0].margin.top = 0
  //   }
  //   let totalHeight = 0
  //   for (let i = 0; i < nodeSizes.length; i++) {
  //     const prevNodeMarginBottom = i > 0 ? nodeSizes[i - 1].margin.bottom : 0
  //     const marginTop = Math.max(prevNodeMarginBottom, nodeSizes[i].margin.top)
  //     totalHeight += marginTop + nodeSizes[i].height
  //   }
  //   totalHeight += nodeSizes[nodeSizes.length - 1].margin.bottom
  //   return totalHeight
  // }

  private calculateNewHeight(newNodeSize: {
    height: number
    margin: { top: number; bottom: number }
  }) {
    if (this.children.length === 0) {
      return newNodeSize.height + newNodeSize.margin.top + newNodeSize.margin.bottom
    }
    const lastChildMarginBottom = this.childBottomMargins[this.childBottomMargins.length - 1] || 0
    const marginTop = Math.max(lastChildMarginBottom, newNodeSize.margin.top)
    const addedMarginTop = marginTop - lastChildMarginBottom
    console.log('[DBUG COLUMN HEIGHT] calculateNewHeight, addedMarginTop:', addedMarginTop, {
      lastChildMarginBottom,
      newNodeMarginTop: newNodeSize.margin.top,
    })
    return this._height + addedMarginTop + newNodeSize.height + newNodeSize.margin.bottom
  }

  get height() {
    return this._height
  }

  tryAddChild(el: HTMLElement) {
    const size = this.getHeight(el)
    const newHeight = this.calculateNewHeight(size)
    console.log('[DBUG COLUMN HEIGHT] tryAddChild, newHeight:', newHeight, {
      el,
      size,
      currentHeight: this._height,
      newHeight,
    })
    if (newHeight > this.maxContentHeight) {
      return false
    }
    this._height = newHeight
    this.childBottomMargins.push(size.margin.bottom)
    this.children.push(el)
    return true
  }
}
