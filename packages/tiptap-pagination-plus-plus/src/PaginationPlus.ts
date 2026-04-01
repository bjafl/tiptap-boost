import { Extension } from '@tiptap/core'
import { EXTENSION_NAME, STYLE_PREFIX } from './constants'
import {
  PageNumber,
  PageSize,
  PaginationPlusOptions,
  Margins,
  PaginationPlusStorage,
  HeaderOrFooter,
} from './types'
import { clearCssVars, syncCssVars } from './utils/cssVars'
import { getPaginationPlugin } from './pm/paginationPlugin'
import { getBreakDecoPlugin } from './pm/breakDecoPlugin'

const defaultContentMargins: Margins = {
  //TODO
  top: 10,
  bottom: 10,
  left: 20,
  right: 20,
}
const defaultOptions = {
  pageSize: { width: 789, height: 800 },
  pageGap: 50,
  pageMargins: { top: 20, bottom: 20, left: 50, right: 50 },
  footer: { right: '{page}', margins: defaultContentMargins },
  header: { margins: defaultContentMargins },
  customHeader: {},
  customFooter: {},
  cssClassPrefix: STYLE_PREFIX,
} as const satisfies PaginationPlusOptions

export const PaginationPlus = Extension.create<PaginationPlusOptions, PaginationPlusStorage>({
  name: EXTENSION_NAME,
  addOptions() {
    return defaultOptions
  },
  addStorage() {
    return {
      ...defaultOptions,
      headerHeight: new Map(),
      footerHeight: new Map(),
    }
  },
  onCreate() {
    const contentEl = this.editor.view.dom
    const parent = contentEl.parentElement

    if (!parent) {
      console.warn('[PaginationPlus] No parent element found')
      return
    }

    const wrapper = document.createElement('div')
    wrapper.classList.add(`${STYLE_PREFIX}-document-wrapper`)

    parent.insertBefore(wrapper, contentEl)
    wrapper.appendChild(contentEl)

    this.storage.wrapperEl = wrapper

    contentEl.classList.add(`${this.options.cssClassPrefix ?? STYLE_PREFIX}-with-pagination`)
    Object.assign(this.storage, this.options)
    syncCssVars(contentEl, this.storage)
  },

  onDestroy() {
    const contentEl = this.editor.view.dom
    const wrapper = this.storage.wrapperEl

    if (wrapper?.parentElement) {
      wrapper.parentElement.insertBefore(contentEl, wrapper)
      wrapper.remove()
    }

    contentEl.classList.remove(`${this.options.cssClassPrefix ?? STYLE_PREFIX}-with-pagination`)
    clearCssVars(contentEl)

    this.storage.wrapperEl = undefined
  },
  addProseMirrorPlugins() {
    return [getPaginationPlugin(this.storage, this.editor.view), getBreakDecoPlugin(this.storage)]
  },
  addCommands() {
    return {
      updatePageSize:
        ({ size, margins }: { size?: PageSize; margins?: Margins }) =>
        () => {
          if (!size && !margins) return false
          console.log('[TEST PP]', 'updatePageSize command executed with size and margins:', {
            size,
            margins,
            oldSize: { ...this.storage.pageSize },
          })
          if (size) {
            this.storage.pageSize = size
          }
          if (margins) {
            this.storage.pageMargins = margins
          }
          console.log('[TEST PP]', 'Updated storage after updatePageSize command:', {
            ...this.storage,
          })
          syncCssVars(this.editor.view.dom, this.storage)
          return true
        },

      updateHeaderFooterContent:
        ({
          header,
          footer,
          pageNumber,
        }: {
          header?: HeaderOrFooter
          footer?: HeaderOrFooter
          pageNumber?: PageNumber
        }) =>
        () => {
          if (!header && !footer) return false
          const hf = [header, footer]
          hf.forEach((content) => {
            if (!content) return
            const { margins: newMargins, ...rest } = content
            if (pageNumber) {
              const margins =
                newMargins ??
                this.storage.customHeader[pageNumber]?.margins ??
                this.storage.header.margins
              this.storage.customHeader = {
                ...this.storage.customHeader,
                [pageNumber]: { margins, ...rest },
              }
            } else {
              const margins = newMargins ?? this.storage.header.margins
              this.storage.header = { margins, ...rest }
            }
          })
          return true
        },
    }
  },
})
