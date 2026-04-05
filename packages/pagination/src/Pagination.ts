import { Extension } from '@tiptap/core'
import type { PaginationOptions, PaginationStorage } from './types'
import { DEFAULT_OPTIONS } from './constants'
import { PageGeometry } from './utils/PageGeometry'
import { syncCssVars, clearCssVars } from './utils/cssVars'
import { getPaginationPlugin, paginationPluginKey } from './pm/paginationPlugin'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tbPagination: {
      /** Force a full DOM-based reflow on the next animation frame. */
      forceReflow: () => ReturnType
    }
  }
}

export const Pagination = Extension.create<PaginationOptions, PaginationStorage>({
  name: 'tbPagination',

  // ── Options ──────────────────────────────────────────────────────────────

  addOptions() {
    return { ...DEFAULT_OPTIONS }
  },

  // ── Storage ───────────────────────────────────────────────────────────────

  addStorage(): PaginationStorage {
    return {
      pageWidthPx: 0,
      pageHeightPx: 0,
      marginsPx: { top: 0, right: 0, bottom: 0, left: 0 },
      contentWidthPx: 0,
      contentHeightPx: 0,
      pageCount: 1,
    }
  },

  // ── Global attributes for split tracking ─────────────────────────────────

  addGlobalAttributes() {
    return [
      {
        // Apply to all block node types that are direct children of the document
        types: [
          'paragraph',
          'heading',
          'bulletList',
          'orderedList',
          'listItem',
          'table',
          'blockquote',
          'codeBlock',
        ],
        attributes: {
          splitId: {
            default: null,
            parseHTML: (el) => el.dataset.splitId ?? null,
            renderHTML: (attrs) => (attrs.splitId ? { 'data-split-id': attrs.splitId } : {}),
          },
          splitPart: {
            default: null,
            parseHTML: (el) => el.dataset.splitPart ?? null,
            renderHTML: (attrs) => (attrs.splitPart ? { 'data-split-part': attrs.splitPart } : {}),
          },
        },
      },
    ]
  },

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onCreate() {
    const geometry = new PageGeometry(this.options)
    const el = this.editor.view.dom as HTMLElement

    // Populate storage with resolved px values
    this.storage.pageWidthPx = geometry.pageWidth
    this.storage.pageHeightPx = geometry.pageHeight
    this.storage.marginsPx = geometry.margins
    this.storage.contentWidthPx = geometry.contentWidth
    this.storage.contentHeightPx = geometry.contentHeight

    // Apply CSS class so SCSS rules engage
    el.classList.add(`${this.options.cssClassPrefix}-active`)

    // Set geometry CSS variables
    syncCssVars(el, geometry, this.options, 1)
  },

  onDestroy() {
    const el = this.editor.view.dom as HTMLElement
    el.classList.remove(`${this.options.cssClassPrefix}-active`)
    clearCssVars(el, this.options)
  },

  // ── ProseMirror plugin ────────────────────────────────────────────────────

  addProseMirrorPlugins() {
    const geometry = new PageGeometry(this.options)
    return [getPaginationPlugin(this.options, geometry)]
  },

  // ── Commands ──────────────────────────────────────────────────────────────

  addCommands() {
    return {
      forceReflow:
        () =>
        ({ editor }) => {
          const state = paginationPluginKey.getState(editor.view.state)
          if (!state) return false
          for (let i = 0; i < state.pageMap.length; i++) {
            state.pageMap.markDirty(i)
          }
          return true
        },
    }
  },
})
