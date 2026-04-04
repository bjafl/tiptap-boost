import { Decoration } from '@tiptap/pm/view'
import type { PageInfo } from './computePages'

export function buildDecorations(pages: PageInfo[], maxPageContentHeight: number): Decoration[] {
  // Prepend a sentinel so index math works uniformly:
  //   idx 0          → first-page header only (no footer, no gap)
  //   idx 1..n-1     → footer + gap + header
  //   idx n          → last-page footer only (no gap, no header)
  const sentinel: PageInfo = { startPos: 0, endPos: 0, contentHeight: 0 }
  const all = [sentinel, ...pages]

  return all.map((page, idx) =>
    Decoration.widget(
      page.endPos,
      () => createBreakElement(page, idx, pages.length, maxPageContentHeight),
      { side: 0 }
    )
  )
}

function createBreakElement(
  page: PageInfo,
  idx: number,
  totalPages: number,
  maxPageContentHeight: number
): HTMLElement {
  const el = document.createElement('div')
  el.className = 'ttb-page-break'

  if (idx !== 0) {
    const spacer = document.createElement('div')
    spacer.className = 'ttb-page-spacer'
    spacer.style.height = `${maxPageContentHeight - page.contentHeight}px`
    el.appendChild(spacer)

    const footer = document.createElement('div')
    footer.className = 'ttb-page-footer'
    footer.style.height = '25mm' // TODO: drive from storage
    el.appendChild(footer)
  }

  if (idx !== 0 && idx !== totalPages) {
    const gap = document.createElement('div')
    gap.className = 'ttb-pagination-gap'
    el.appendChild(gap)
  }

  if (idx !== totalPages) {
    const header = document.createElement('div')
    header.className = 'ttb-page-header'
    header.style.height = '25mm' // TODO: drive from storage
    el.appendChild(header)
  }

  return el
}
