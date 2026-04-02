import { Decoration } from '@tiptap/pm/view'
import {
  FooterHeightMap,
  HeaderHeightMap,
  HeaderOrFooter,
  PageNumber,
  PaginationPlusStorage,
} from '../types'
import { calculatePageCount } from '../utils/pageCount'
import { HeightCalculator } from '../utils/HeightCalculator'
import { cascadeMaps } from '../utils/valueHelpers'

export function getPageBreakWidget(
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

      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const pageBreak = createPageBreak(storage, headerHeightMap, footerHeightMap, pageNum)
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

function createPageBreak(
  storage: PaginationPlusStorage,
  headerHeightMap: HeaderHeightMap,
  footerHeightMap: FooterHeightMap,
  pageNumber: PageNumber
) {
  const nextPageNumber = pageNumber + 1
  const nextHeader = {
    content: cascadeMaps(storage.customHeader, nextPageNumber, storage.header),
    height: cascadeMaps(headerHeightMap, [nextPageNumber, 0], 0),
  }
  const footer = {
    content: cascadeMaps(storage.customFooter, pageNumber, storage.footer),
    height: cascadeMaps(footerHeightMap, [pageNumber, 0], 0),
  }
  console.log('[ppp]footer info:', {
    pageNumber,
    footer: storage.footer,
    cascaded: footer.content,
    height: footer.height,
  })
  const nextPageHeader = createHeaderOrFooter(nextHeader.content, storage, 'header', nextPageNumber)
  const pageFooter = createHeaderOrFooter(footer.content, storage, 'footer', pageNumber)

  const heightCalc = new HeightCalculator({ storage })
  const { pageHeaderHeight, pageHeight, pageFooterHeight } = heightCalc.calcPageHeights(
    nextHeader.height,
    footer.height
  )
  const prefix = storage.cssClassPrefix
  const breakContainer = document.createElement('div')
  breakContainer.classList.add(`${prefix}-page-break`)
  breakContainer.style.top = `${pageHeight}px`

  // const pageContent = document.createElement('div')
  // pageContent.classList.add(`${prefix}-page`)
  // TODO
  // const marginTop = firstPage ? `calc(${pageHeaderHeight}px + ${pageHeight}px)` : pageHeight + 'px'
  // if (pageNumber) {
  //   page.style.marginTop = `var(--${prefix}-page-content-${pageNumber}, ${marginTop})`
  // } else {
  //   page.style.marginTop = firstPage
  //     ? `var(--${prefix}-page-content-first, ${marginTop})`
  //     : `var(--${prefix}-page-content-general, ${marginTop})`
  // }

  // const pageBreak = document.createElement('div')
  // pageBreak.classList.add(`${prefix}-page-break-inner`)
  nextPageHeader.style.height = `${pageHeaderHeight}px`
  pageFooter.style.height = `${pageFooterHeight}px`
  // pageContent.style.height = `${pageHeight}px`

  const pageSpace = document.createElement('div')
  pageSpace.classList.add(`${prefix}-pagination-gap`)

  // pageBreak.append(pageHeader, pageFooter, pageSpace)
  breakContainer.append(pageFooter, pageSpace, nextPageHeader)

  return breakContainer
}

function replaceTextMacros(text: string, cssClassPrefix: string) {
  return text.replace(/{page}/g, `<span class="${cssClassPrefix}-page-number"></span>`)
}

function createHeaderOrFooter(
  content: HeaderOrFooter,
  storage: PaginationPlusStorage,
  type: 'header' | 'footer',
  pageNumber?: PageNumber
) {
  const prefix = storage.cssClassPrefix
  const onClick = type === 'header' ? storage.onHeaderClick : storage.onFooterClick

  const containerDiv = document.createElement('div')
  containerDiv.classList.add(
    `${prefix}-page-${type}`,

    `.${prefix}-page-${type}-${pageNumber ? pageNumber : 0}`
  )
  if (onClick !== undefined && pageNumber !== undefined) {
    containerDiv.addEventListener('click', (event) => onClick({ event, pageNumber }))
  }

  const innerElements = (['left', 'center', 'right'] as const).map((pos) => {
    const div = document.createElement('div')
    div.classList.add(`${prefix}-page-${type}-${pos}`)
    const text = content[pos]
    div.innerHTML = text ? replaceTextMacros(text, prefix) : ''
    return div
  })

  containerDiv.append(...innerElements)
  return containerDiv
}
