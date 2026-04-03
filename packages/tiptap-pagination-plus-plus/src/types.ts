import { PaginationPlus } from './PaginationPlus'
import { CSSLength, CSSLengthValue } from './utils/CSSLength'

export type PaginationPlusExtension = typeof PaginationPlus
export type PageNumber = number


export type HeaderClickEvent = (params: { event: MouseEvent; pageNumber: PageNumber }) => void

export type FooterClickEvent = (params: { event: MouseEvent; pageNumber: PageNumber }) => void

export interface Margins {
  top: CSSLengthValue
  bottom: CSSLengthValue
  left: CSSLengthValue
  right: CSSLengthValue
}

export interface PageSize {
  width: CSSLengthValue
  height: CSSLengthValue
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
  pageGap: CSSLengthValue
  customHeader: Record<PageNumber, HeaderOrFooter>
  customFooter: Record<PageNumber, HeaderOrFooter>
  cssClassPrefix?: string // Must match prefix in scss file
  onHeaderClick?: HeaderClickEvent
  onFooterClick?: FooterClickEvent
}

export interface PaginationPlusStorage extends PaginationPlusOptions {
  footer: HeaderOrFooter & { margins: Margins }
  header: HeaderOrFooter & { margins: Margins }
  cssClassPrefix: string
  outerEl?: HTMLElement
  wrapperEl?: HTMLElement
}


export interface BreakInfo {
  pos: number
  spacerHeight: number
  pageNumber: number
  /** True for the terminal entry — renders only footer, no gap/next-header. */
  isLast?: boolean
}
