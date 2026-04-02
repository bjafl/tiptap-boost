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
