import { PaginationPlus } from './PaginationPlus'
import type { PaginationPlusStorage, PageSize, PageNumber, Margins, HeaderOrFooter } from './types'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    PaginationPlus: {
      updatePageSize: ({ size, margins }: { size?: PageSize; margins?: Margins }) => ReturnType
      updateHeaderFooterContent: ({
        header,
        footer,
        pageNumber,
      }: {
        header?: HeaderOrFooter
        footer?: HeaderOrFooter
        pageNumber?: PageNumber
      }) => ReturnType
    }
  }
  interface Storage {
    PaginationPlus: PaginationPlusStorage
  }
}

export { PaginationPlus }
export { PAGE_SIZES } from './constants'
export type * from './types'
