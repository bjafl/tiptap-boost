import type { PageDimensions } from './types'

const make = (
  height: number,
  width: number,
  top: number,
  bottom: number,
  left: number,
  right: number
): PageDimensions => ({
  height,
  width,
  margin: { top, bottom, left, right },
})

export const A4_PAGE_SIZE = make(1123, 794, 95, 95, 76, 76)
export const A3_PAGE_SIZE = make(1591, 1123, 95, 95, 76, 76)
export const A5_PAGE_SIZE = make(794, 419, 76, 76, 57, 57)
export const LETTER_PAGE_SIZE = make(1060, 818, 96, 96, 96, 96)
export const LEGAL_PAGE_SIZE = make(1404, 818, 96, 96, 96, 96)
export const TABLOID_PAGE_SIZE = make(1635, 1060, 96, 96, 96, 96)

export const PAGE_SIZES = {
  A4: A4_PAGE_SIZE,
  A3: A3_PAGE_SIZE,
  A5: A5_PAGE_SIZE,
  LETTER: LETTER_PAGE_SIZE,
  LEGAL: LEGAL_PAGE_SIZE,
  TABLOID: TABLOID_PAGE_SIZE,
}

export const EXTENSION_NAME = 'PaginationPlus'
export const DEFAULT_STYLE_PREFIX = 'ttb'
export const CONFIG_CHANGE_META_KEY = 'configChanged'
export const BREAKS_META_KEY = 'paginationBreaks'
export const PAGINATION_SPLIT_META_KEY = 'paginationSplit'
