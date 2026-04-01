import { EditorView } from '@tiptap/pm/view'
import { PaginationPlusStorage } from '../types'

export function getExistingPageCount(view: EditorView, storage: PaginationPlusStorage) {
  const editorDom = view.dom
  const paginationElement = editorDom.querySelector(`[data-${storage.cssClassPrefix}-pagination]`)
  if (paginationElement) {
    return paginationElement.children.length
  }
  return 0
}

export function calculatePageCount(
  view: EditorView,
  storage: PaginationPlusStorage,
  headerHeight: number = 0,
  footerHeight: number = 0
) {
  const editorDom = view.dom

  const pageHeaderHeight =
    storage.header.margins.top +
    storage.header.margins.bottom +
    storage.pageMargins.top +
    headerHeight
  const pageFooterHeight =
    storage.footer.margins.top +
    storage.footer.margins.bottom +
    storage.pageMargins.bottom +
    footerHeight

  const pageContentAreaHeight = storage.pageSize.height - pageHeaderHeight - pageFooterHeight

  const paginationElement = editorDom.querySelector(`[data-${storage.cssClassPrefix}-pagination]`)
  const currentPageCount = getExistingPageCount(view, storage)
  if (paginationElement) {
    const lastElementOfEditor = editorDom.lastElementChild
    const lastPageBreak = paginationElement.lastElementChild?.querySelector('.breaker')
    if (lastElementOfEditor && lastPageBreak) {
      const lastElementRect = lastElementOfEditor.getBoundingClientRect()
      const lastPageBreakRect = lastPageBreak.getBoundingClientRect()
      const lastPageGap = lastElementRect.bottom - lastPageBreakRect.bottom
      if (lastPageGap > 0) {
        const addPage = Math.ceil(lastPageGap / pageContentAreaHeight)
        return currentPageCount + addPage
      } else {
        const lpFrom = -10
        const lpTo = -(storage.pageSize.height - 10)
        if (lastPageGap > lpTo && lastPageGap < lpFrom) {
          return currentPageCount
        } else if (lastPageGap < lpTo) {
          const pageHeightOnRemove = storage.pageSize.height + storage.pageGap
          const removePage = Math.floor(lastPageGap / pageHeightOnRemove)
          return currentPageCount + removePage
        } else {
          return currentPageCount
        }
      }
    }
    return 1
  } else {
    const editorHeight = editorDom.scrollHeight
    let pageCount = Math.ceil(editorHeight / pageContentAreaHeight)
    pageCount = pageCount <= 0 ? 1 : pageCount
    return pageCount
  }
}
