import { HeaderOrFooter, PaginationPlusStorage, PageNumber } from '../types'
import { HeightCalculator } from './HeightCalculator'

function replaceTextMacros(text: string, cssClassPrefix: string) {
  return text.replace(/{page}/g, `<span class="${cssClassPrefix}-page-number"></span>`)
}
export function createHeaderOrFooterDiv(
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

export function createPageBreakDefinition(
  storage: PaginationPlusStorage,
  firstPage: boolean,
  pageHeader: HTMLElement,
  pageFooter: HTMLElement,
  headerHeight: number,
  footerHeight: number,
  pageNumber?: PageNumber
) {
  const heightCalc = new HeightCalculator({ storage })
  const { pageHeaderHeight, pageHeight } = heightCalc.calcPageHeights(headerHeight, footerHeight)
  const prefix = storage.cssClassPrefix
  const pageContainer = document.createElement('div')
  pageContainer.classList.add(`${prefix}-page-break`)

  const page = document.createElement('div')
  page.classList.add(`${prefix}-page`)
  const marginTop = firstPage ? `calc(${pageHeaderHeight}px + ${pageHeight}px)` : pageHeight + 'px'
  if (pageNumber) {
    page.style.marginTop = `var(--${prefix}-page-content-${pageNumber}, ${marginTop})`
  } else {
    page.style.marginTop = firstPage
      ? `var(--${prefix}-page-content-first, ${marginTop})`
      : `var(--${prefix}-page-content-general, ${marginTop})`
  }

  const pageBreak = document.createElement('div')
  pageBreak.classList.add(`${prefix}-page-break-inner`)
  // pageBreak.style.width = `calc(100% + var(--${STYLE_PREFIX}-margin-left) + var(--${STYLE_PREFIX}-margin-right))`
  // pageBreak.style.marginLeft = `calc(-1 * var(--${STYLE_PREFIX}-margin-left))`
  // pageBreak.style.marginRight = `calc(-1 * var(--${STYLE_PREFIX}-margin-right))`
  // pageBreak.style.position = 'relative'
  // pageBreak.style.float = 'left'
  // pageBreak.style.clear = 'both'
  // pageBreak.style.left = `0px`
  // pageBreak.style.right = `0px`
  // pageBreak.style.zIndex = '2'

  const pageSpace = document.createElement('div')
  pageSpace.classList.add(`${prefix}-pagination-gap`)
  // pageSpace.style.height = _pageGap + 'px'

  pageBreak.append(pageFooter, pageSpace, pageHeader)
  pageContainer.append(page, pageBreak)

  return pageContainer
}
