import { EditorState, Plugin, PluginKey } from '@tiptap/pm/state'
import { DecorationSet, EditorView } from '@tiptap/pm/view'
import { getPageWidget } from './pageWidget'
import { PageNumber, PaginationPlusStorage } from '../types'
import { getFirstHeaderWidget } from './firstHeaderWidget'
import { syncCssVars } from '../utils/cssVars'
import { calculatePageCount, getExistingPageCount } from '../utils/pageCount'
import { PAGE_COUNT_META_KEY } from '../constants'
import { HeightCalculator } from '../utils/HeightCalculator'

const key = new PluginKey('pagination')
export function getPaginationPlugin(storage: PaginationPlusStorage, editorView: EditorView) {
  return new Plugin({
    key,
    state: {
      init: (_, state) => ({
        decorations: DecorationSet.create(state.doc, [
          getPageWidget(storage, new Map(), new Map()),
          getFirstHeaderWidget(storage, new Map()),
        ]),
      }),
      // {
      // const widgetList = createDecoration(
      //   this.storage,
      //   new Map(),
      //   new Map(),
      //   this.storage.cssClassPrefix
      // )
      // this.storage = {
      //   ...defaultOptions,
      //   ...this.options,
      //   footer: { margins: defaultContentMargins, ...this.options.footer },
      //   header: { margins: defaultContentMargins, ...this.options.header },
      //   headerHeight: new Map(),
      //   footerHeight: new Map(),
      // }

      // return {
      //   decorations: DecorationSet.create(state.doc, widgetList),
      // }
      apply: (_tr, oldDeco, _oldState, newState) => {
        const pageCount = calculatePageCount(editorView, storage)
        const currentPageCount = getExistingPageCount(editorView, storage)

        // TODO: || storage!==options ...
        if ((pageCount > 1 ? pageCount : 1) !== currentPageCount) {
          syncCssVars(editorView.dom, storage)
          const headerHeight = 'headerHeight' in storage ? storage.headerHeight : new Map()
          const footerHeight = 'footerHeight' in storage ? storage.footerHeight : new Map()
          return {
            decorations: DecorationSet.create(newState.doc, [
              getPageWidget(storage, headerHeight, footerHeight),
              getFirstHeaderWidget(storage, headerHeight),
            ]),
            footerHeight,
          }
        }

        return oldDeco
      },
    },

    props: {
      decorations(state: EditorState) {
        return this.getState(state)?.decorations as DecorationSet
      },
    },
    view: (editorView: EditorView) => {
      return {
        update: (view: EditorView) => {
          const pageCount = calculatePageCount(view, storage)
          const currentPageCount = getExistingPageCount(view, storage)

          // const triggerUpdate = (_footerHeight?: FooterHeightMap) => {
          //   requestAnimationFrame(() => {
          //     const tr = view.state.tr.setMeta(PAGE_COUNT_META_KEY, {
          //       footerHeight: _footerHeight,
          //     })
          //     view.dispatch(tr)
          //   })
          // }

          if (currentPageCount !== pageCount) {
            requestAnimationFrame(() => {
              const tr = view.state.tr.setMeta(PAGE_COUNT_META_KEY, {
                footerHeight: undefined,
              })
              view.dispatch(tr)
            })
            return
          }
          const headerFooterCalc = new HeightCalculator({ storage, heightType: 'content' })
          const customHeaderPageNumbers = Object.keys(storage.customHeader)
            .map(Number)
            .filter((num) => num <= pageCount)
          const customFooterPageNumbers = Object.keys(storage.customFooter)
            .map(Number)
            .filter((num) => num <= pageCount)
          const customHeaderHeight = headerFooterCalc.getHeaderHeights(
            customHeaderPageNumbers,
            view.dom
          )
          const customFooterHeight = headerFooterCalc.getFooterHeights(
            customFooterPageNumbers,
            view.dom
          )

          const pagesToCheck = new Set([1, ...customHeaderPageNumbers, ...customFooterPageNumbers])

          // TODO: what's going on here .....?

          let missingPageNumber: PageNumber | undefined = undefined
          for (let i = 1; i <= pageCount; i++) {
            if (!pagesToCheck.has(i)) {
              missingPageNumber = i
              break
            }
          }
          if (missingPageNumber) {
            pagesToCheck.add(missingPageNumber)
          }

          pagesToCheck.delete(0)
          let pageContentHeightVariable: Record<string, string> = {}
          let maxContentHeight: number | undefined = undefined
          const heightCalc = new HeightCalculator({ storage })
          for (const page of pagesToCheck) {
            const headerHeight = customHeaderHeight.has(page)
              ? customHeaderHeight.get(page) || 0
              : customHeaderHeight.get(0) || 0
            const footerHeight = customFooterHeight.has(page)
              ? customFooterHeight.get(page) || 0
              : customFooterHeight.get(0) || 0
            const { pageHeaderHeight, pageHeight } = heightCalc.calcPageHeights(
              headerHeight,
              footerHeight
            )

            const contentHeight = page === 1 ? pageHeight + pageHeaderHeight : pageHeight
            if (page === 1) {
              pageContentHeightVariable['page-content-first'] = `${contentHeight}px`
            }
            if (page === missingPageNumber) {
              pageContentHeightVariable['page-content-general'] = `${contentHeight}px`
            } else {
              pageContentHeightVariable[`page-content-${page}`] = `${contentHeight}px`
            }
            if (maxContentHeight === undefined || contentHeight < maxContentHeight) {
              maxContentHeight = contentHeight
            }
          }

          if (maxContentHeight) {
            view.dom.style.setProperty(
              `--${storage.cssClassPrefix}-max-content-child-height`,
              `${maxContentHeight - 10}px`
            )
          }
          Object.entries(pageContentHeightVariable).forEach(([key, value]) => {
            view.dom.style.setProperty(`--${storage.cssClassPrefix}-${key}`, value)
          })
          refreshPage(view.dom, storage)

          return
        },
      }
    },
  })
}

function refreshPage(targetNode: HTMLElement, storage: PaginationPlusStorage) {
  const paginationElement = targetNode.querySelector(`[data-${storage.cssClassPrefix}-pagination]`)
  if (paginationElement) {
    const lastPageBreak = paginationElement.lastElementChild?.querySelector(
      `.${storage.cssClassPrefix}-page-break-inner`
    ) as HTMLElement
    if (lastPageBreak) {
      const minHeight = lastPageBreak.offsetTop + lastPageBreak.offsetHeight
      targetNode.style.minHeight = `calc(${minHeight}px + 2px)`
    }
  }
}
