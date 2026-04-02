import { Extension } from '@tiptap/core'
import { EXTENSION_NAME, DEFAULT_STYLE_PREFIX, CONFIG_CHANGE_META_KEY } from './constants'
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
  top: 90,
  bottom: 90,
  left: 70,
  right: 70,
}
const defaultOptions = {
  pageSize: { width: 789, height: 800 },
  pageGap: 50,
  pageMargins: { top: 95, bottom: 95, left: 76, right: 76 },
  footer: { right: '{page}', margins: defaultContentMargins },
  header: { margins: defaultContentMargins },
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
