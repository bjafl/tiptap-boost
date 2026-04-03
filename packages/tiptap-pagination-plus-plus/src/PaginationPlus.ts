import { Extension } from '@tiptap/core'
import { EXTENSION_NAME, DEFAULT_STYLE_PREFIX, CONFIG_CHANGE_META_KEY } from './constants'
import {
  PageNumber,
  PageSize,
  PaginationPlusOptions,
  Margins,
  PaginationPlusStorage,
  HeaderOrFooter,
  PageDimensions,
} from './types'
import { clearCssVars, syncCssVars } from './utils/cssVars'
import { getPaginationPlugin } from './pm/paginationPlugin'
import { getBreakDecoPlugin } from './pm/breakDecoPlugin'
import { getDebugPlugin } from './pm/debugPlugin'

const defaultContentMargins: Margins = {
  //TODO
  top: '20mm',
  bottom: '10mm',
  left: '20mm',
  right: '20mm',
}
const defaultOptions = {
  pageSize: { width: '210mm', height: '297mm' },
  pageGap: 50,
  pageMargins: { top: '25mm', bottom: '25mm', left: '25mm', right: '25mm' },
  footer: {
    right: '{page}',
    margins: { top: '10mm', bottom: '20mm', left: '20mm', right: '20mm' },
  },
  header: { margins: { top: '20mm', bottom: '10mm', left: '20mm', right: '20mm' } },
  customHeader: {},
  customFooter: {},
  cssClassPrefix: DEFAULT_STYLE_PREFIX,
} as const satisfies PaginationPlusOptions

export const PaginationPlus = Extension.create<PaginationPlusOptions, PaginationPlusStorage>({
  name: EXTENSION_NAME,
  addOptions() {
    return defaultOptions
  },
  addStorage() {
    return { ...defaultOptions }
  },
  onCreate() {
    const contentEl = this.editor.view.dom
    const parent = contentEl.parentElement

    if (!parent) {
      console.warn('[PaginationPlus] No parent element found')
      return
    }

    const wrapper = document.createElement('div')
    wrapper.classList.add(`${DEFAULT_STYLE_PREFIX}-document-wrapper`)

    parent.insertBefore(wrapper, contentEl)
    wrapper.appendChild(contentEl)

    this.storage.wrapperEl = wrapper

    contentEl.classList.add(
      `${this.options.cssClassPrefix ?? DEFAULT_STYLE_PREFIX}-with-pagination`
    )
    console.log('[ppp] on create, storage and options:', {
      storage: { ...this.storage },
      options: { ...this.options },
    })
    Object.assign(this.storage, this.options)
    this.editor.view.dispatch(
      this.editor.view.state.tr.setMeta(CONFIG_CHANGE_META_KEY, Object.keys(this.options))
    )
    syncCssVars(contentEl, this.storage)
  },

  onDestroy() {
    const contentEl = this.editor.view.dom
    const wrapper = this.storage.wrapperEl

    if (wrapper?.parentElement) {
      wrapper.parentElement.insertBefore(contentEl, wrapper)
      wrapper.remove()
    }

    contentEl.classList.remove(
      `${this.options.cssClassPrefix ?? DEFAULT_STYLE_PREFIX}-with-pagination`
    )
    clearCssVars(contentEl)

    this.storage.wrapperEl = undefined
  },
  addProseMirrorPlugins() {
    const pageDimensions: PageDimensions = {
      ...this.storage.pageSize,
      margin: this.storage.pageMargins,
    }
    console.log('[ppp] addProseMirrorPlugins, pageDimensions:', pageDimensions)
    return [getDebugPlugin(pageDimensions)]
    // return [getPaginationPlugin(this.storage, this.editor.view), getBreakDecoPlugin(this.storage)]
  },
  addCommands() {
    return {
      updatePageSize:
        ({ size, margins }: { size?: PageSize; margins?: Margins }) =>
        () => {
          if (!size && !margins) return false

          if (size) {
            this.storage.pageSize = size
          }
          if (margins) {
            this.storage.pageMargins = margins
          }
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
