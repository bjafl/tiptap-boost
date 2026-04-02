import { HeaderOrFooter, PaginationPlusStorage, PageNumber } from '../types'

function replaceTextMacros(text: string, cssClassPrefix: string, pageNumber: number) {
  return text.replace(/{page}/g, `<span class="${cssClassPrefix}-page-number">${pageNumber}</span>`)
}

export function createHeaderOrFooterDiv(
  content: HeaderOrFooter,
  storage: PaginationPlusStorage,
  type: 'header' | 'footer',
  pageNumber?: PageNumber
) {
  const prefix = storage.cssClassPrefix
  const onClick = type === 'header' ? storage.onHeaderClick : storage.onFooterClick
  const defaultMargins = type === 'header' ? storage.header.margins : storage.footer.margins
  const margins = content.margins ?? defaultMargins

  const containerDiv = document.createElement('div')
  containerDiv.classList.add(`${prefix}-page-${type}`, `${prefix}-page-${type}-${pageNumber ?? 0}`)
  containerDiv.style.paddingTop = margins.top.toString()
  containerDiv.style.paddingBottom = margins.bottom.toString()
  containerDiv.style.paddingLeft = margins.left.toString()
  containerDiv.style.paddingRight = margins.right.toString()

  if (onClick !== undefined && pageNumber !== undefined) {
    containerDiv.addEventListener('click', (event) => onClick({ event, pageNumber }))
  }

  const innerElements = (['left', 'center', 'right'] as const).map((pos) => {
    const div = document.createElement('div')
    div.classList.add(`${prefix}-page-${type}-${pos}`)
    const text = content[pos]
    div.innerHTML = text ? replaceTextMacros(text, prefix, pageNumber ?? 0) : ''
    return div
  })

  containerDiv.append(...innerElements)
  return containerDiv
}
