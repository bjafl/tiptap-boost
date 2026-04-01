import { PaginationPlus, PAGE_SIZES } from '@tiptap-boost/tiptap-pagination-plus-plus'
import type { AnyExtension } from '@tiptap/core'

const defaults = {
  ...PAGE_SIZES.A4,
  pageGap: 20,
  footerRight: '{page}',
  footerLeft: '',
  headerRight: '',
  headerLeft: '',
  contentMarginTop: 10,
  contentMarginBottom: 10,
  pageGapBorderColor: '#e5e5e5',
  pageBreakBackground: '#ffffff',
  pageGapBorderSize: 1,
  customHeader: {},
  customFooter: {},
}

export function getTestExtension(config: Record<string, unknown>): AnyExtension {
  return PaginationPlus.configure({
    ...defaults,
    ...config,
  }) as AnyExtension
}
