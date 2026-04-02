import { Decoration } from '@tiptap/pm/view'
import { BreakInfo, PaginationPlusStorage } from '../types'
import { createHeaderOrFooterDiv } from '../utils/containers'

export function createSpacerWidget(breakInfo: BreakInfo, storage: PaginationPlusStorage) {
  return Decoration.widget(
    breakInfo.pos,
    () => {
      const el = document.createElement('div')
      el.classList.add(`${storage.cssClassPrefix}-page-spacer`)
      el.style.height = `${breakInfo.spacerHeight}px`
      return el
    },
    { block: true, side: -2 }
  )
}

export function createPageBreakWidget(breakInfo: BreakInfo, storage: PaginationPlusStorage) {
  return Decoration.widget(
    breakInfo.pos,
    () => {
      const { pageNumber } = breakInfo
      const nextPageNumber = pageNumber + 1

      const footerContent = storage.customFooter[pageNumber] ?? storage.footer
      const nextHeaderContent = storage.customHeader[nextPageNumber] ?? storage.header

      const prefix = storage.cssClassPrefix
      const container = document.createElement('div')
      container.classList.add(`${prefix}-page-break`)

      const footer = createHeaderOrFooterDiv(footerContent, storage, 'footer', pageNumber)
      const gap = document.createElement('div')
      gap.classList.add(`${prefix}-pagination-gap`)
      const header = createHeaderOrFooterDiv(nextHeaderContent, storage, 'header', nextPageNumber)

      container.append(footer, gap, header)
      return container
    },
    { block: true, side: -1 }
  )
}
