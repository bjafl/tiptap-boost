import { STYLE_PREFIX } from '../constants'
import { HeaderFooterType, HeightType, PageNumber, PaginationPlusStorage } from '../types'

export class HeightCalculatorNoStorageError extends Error {
  constructor() {
    super('No storage provided for height calculation')
    this.name = 'HeightCalculatorNoStorageError'
  }
}

export class HeightCalculator {
  private cssClassPrefix?: string
  private heightType?: HeightType
  private storage?: PaginationPlusStorage

  private static readonly defaultProps = {
    cssClassPrefix: STYLE_PREFIX,
    heightType: 'actual',
  } as const

  constructor(
    props: {
      heightType?: HeightType
      cssClassPrefix?: string
      storage?: PaginationPlusStorage
    } = {}
  ) {
    this.heightType = props.heightType
    this.storage = props.storage
    this.cssClassPrefix = props.cssClassPrefix ?? props.storage?.cssClassPrefix
  }

  private get safeHeightType() {
    if (this.heightType) return this.heightType
    const defaultVal = HeightCalculator.defaultProps.heightType
    console.warn('[HeightCalculator] No height type provided, using default:', defaultVal)
    return defaultVal
  }
  private get safeCssClassPrefix() {
    if (this.cssClassPrefix) return this.cssClassPrefix
    const defaultVal = HeightCalculator.defaultProps.cssClassPrefix
    console.warn('[HeightCalculator] No CSS class prefix provided, using default:', defaultVal)
    return defaultVal
  }
  //TODO: Check css class suffix -page-#type#-content !!
  private getHeightSelector(pageNumber: PageNumber, type: HeaderFooterType) {
    return this.safeHeightType === 'actual'
      ? `.${this.safeCssClassPrefix}-page-${type}-${pageNumber}`
      : `.${this.safeCssClassPrefix}-page-${type}-${pageNumber} .${this.safeCssClassPrefix}-page-${type}-content`
  }

  private calculateHeights(
    pageNumbers: PageNumber[],
    targetNode: HTMLElement,
    type: HeaderFooterType
  ) {
    const heightMap = new Map<PageNumber, number>()

    const clientNode = targetNode.querySelector(this.getHeightSelector(0, type))
    heightMap.set(0, clientNode ? clientNode.clientHeight : 0)

    pageNumbers.forEach((pageNumber) => {
      const clientNode = targetNode.querySelector(this.getHeightSelector(pageNumber, type))
      const height = clientNode ? clientNode.clientHeight : 0
      heightMap.set(pageNumber, height)
    })
    return heightMap
  }

  getHeaderHeights(pageNumbers: PageNumber[], targetNode: HTMLElement) {
    return this.calculateHeights(pageNumbers, targetNode, 'header')
  }

  getFooterHeights(pageNumbers: PageNumber[], targetNode: HTMLElement) {
    return this.calculateHeights(pageNumbers, targetNode, 'footer')
  }

  // TODO: check usage and implementation location..
  calcPageHeights(headerHeight: number, footerHeight: number) {
    if (!this.storage) {
      throw new HeightCalculatorNoStorageError()
    }

    const pageHeaderHeight =
      this.storage.header.margins.top +
      this.storage.header.margins.bottom +
      this.storage.pageMargins.top +
      headerHeight
    const pageFooterHeight =
      this.storage.footer.margins.top +
      this.storage.footer.margins.bottom +
      this.storage.pageMargins.bottom +
      footerHeight
    const pageHeight = this.storage.pageSize.height - pageHeaderHeight - pageFooterHeight
    return {
      pageHeaderHeight,
      pageFooterHeight,
      pageHeight,
    }
  }

  // TODO: check usage and implementation location..
  // TODO: check selectors, and get from constants
  getContentHeightFromDom(editorDom: HTMLElement, pageNumber: PageNumber) {
    const pageBreak = editorDom.querySelector(
      `#pages > .${this.safeCssClassPrefix}-page-break:nth-child(${pageNumber}) > .page`
    )
    if (pageBreak) {
      return parseFloat(window.getComputedStyle(pageBreak).marginTop)
    }
    return 0
  }
}
