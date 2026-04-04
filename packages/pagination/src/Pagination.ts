import { Extension } from '@tiptap/core'
import { EXTENSION_NAME } from './config'

export const Pagination = Extension.create<PaginationOptions, PaginationStorage>({
  name: EXTENSION_NAME,
  addOptions() {
    return
  },
  addStorage() {
    return
  },
  onCreate() {},

  onDestroy() {},

  addCommands() {
    return {}
  },
})
