import { PaginationPlus } from './PaginationPlus'

export type PaginationPlusExtension = typeof PaginationPlus
export type PageNumber = number

export type HeaderHeightMap = Map<PageNumber, number>
export type FooterHeightMap = Map<PageNumber, number>

export type HeaderClickEvent = (params: { event: MouseEvent; pageNumber: PageNumber }) => void

export type FooterClickEvent = (params: { event: MouseEvent; pageNumber: PageNumber }) => void

export interface Margins {
  top: number
  bottom: number
  left: number
  right: number
}

export interface PageSize {
  width: number
  height: number
}

export interface PageDimensions extends PageSize {
  margin: Margins
}

export interface HeaderOrFooter {
  left?: string
  center?: string
  right?: string
  margins?: Margins
}

export interface PaginationPlusOptions {
  pageSize: PageSize
  pageMargins: Margins
  footer: Partial<HeaderOrFooter>
  header: Partial<HeaderOrFooter>
  pageGap: number
  customHeader: Record<PageNumber, HeaderOrFooter>
  customFooter: Record<PageNumber, HeaderOrFooter>
  cssClassPrefix?: string // Must match prefix in scss file
  onHeaderClick?: HeaderClickEvent
  onFooterClick?: FooterClickEvent
}

export interface PaginationPlusStorage extends PaginationPlusOptions {
  footer: HeaderOrFooter & { margins: Margins }
  header: HeaderOrFooter & { margins: Margins }
  headerHeight: HeaderHeightMap
  footerHeight: FooterHeightMap
  cssClassPrefix: string
  outerEl?: HTMLElement
  wrapperEl?: HTMLElement
}

export type HeightType = 'actual' | 'content'
export type HeaderFooterType = 'header' | 'footer'

export interface BreakInfo {
  pos: number
  spacerHeight: number
  pageNumber: number
}
