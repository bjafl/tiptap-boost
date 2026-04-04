import { PaginationPlus } from './Pagination'
import type { PaginationPlusStorage, PageSize, PageNumber, Margins, HeaderOrFooter } from './types'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    
}

export { PaginationPlus }
export { PAGE_SIZES } from './constants'
export type * from './types'
