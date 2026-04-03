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
  relative: boolean
  boxType: RectBoxType
  domPos?: Point
  margin?: Record<Side, number>
  padding?: Record<Side, number>
  borderWidth?: Record<Side, number>
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
