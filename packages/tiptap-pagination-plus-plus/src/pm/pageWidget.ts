import { Decoration } from '@tiptap/pm/view'
import { FooterHeightMap, HeaderHeightMap, PageNumber, PaginationPlusStorage } from '../types'
import { calculatePageCount } from '../utils/pageCount'
import { createHeaderOrFooterDiv, createPageBreakDefinition } from '../utils/containers'

export function getPageWidget(
  storage: PaginationPlusStorage,
  headerHeightMap: HeaderHeightMap,
  footerHeightMap: FooterHeightMap
) {
  return Decoration.widget(
    0,
    (view) => {
      const el = document.createElement('div')
      el.dataset[`${storage.cssClassPrefix}Pagination`] = 'true'

      const fragment = document.createDocumentFragment()
      const pageCount = calculatePageCount(view, storage)

      for (let i = 0; i < pageCount; i++) {
        const pageNumber = i + 1
        const headerPageNumber = i + 2
        const opts = {
          header: {
            content: storage.customHeader[headerPageNumber] ?? storage.header,
            height: headerHeightMap.get(headerPageNumber) ?? headerHeightMap.get(0) ?? 0,
          },
          footer: {
            content: storage.customFooter[pageNumber] ?? storage.footer,
            height: footerHeightMap.get(pageNumber) ?? footerHeightMap.get(0) ?? 0,
          },
        }

        const pageHeader = createHeaderOrFooterDiv(
          opts.header.content,
          storage,
          'header',
          headerPageNumber
        )
        const pageFooter = createHeaderOrFooterDiv(
          opts.footer.content,
          storage,
          'footer',
          pageNumber
        )

        const pageBreak = createPageBreakDefinition(
          storage,
          i === 0,
          pageHeader,
          pageFooter,
          opts.header.height,
          opts.footer.height,
          pageNumber
        )
        fragment.appendChild(pageBreak)
      }
      el.append(fragment)
      el.id = 'pages'
      el.classList.add(`${storage.cssClassPrefix}-pages-wrapper`)

      return el
    },
    { side: -1 }
  )
}
