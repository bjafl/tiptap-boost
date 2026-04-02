import { Decoration } from '@tiptap/pm/view'
import { PaginationPlusStorage } from '../types'
import { createHeaderOrFooterDiv } from '../utils/containers'

export function getFirstHeaderWidget(storage: PaginationPlusStorage) {
  return Decoration.widget(
    0,
    () => {
      const pageNumber = 1
      const headerContent = storage.customHeader[pageNumber] ?? storage.header
      const el = createHeaderOrFooterDiv(headerContent, storage, 'header', pageNumber)
      el.classList.add(`${storage.cssClassPrefix}-first-page-header`)
      return el
    },
    { block: true, side: -1 }
  )
}
