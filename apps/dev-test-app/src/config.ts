import { Pagination } from '@tiptap-boost/pagination'
import '@tiptap-boost/pagination/styles/pagination.scss'
import '@/styles/pagination-debug.css'
// import {
//   TablePlus,
//   TableRowPlus,
//   TableCellPlus,
//   TableHeaderPlus,
// } from '@tiptap-boost/tiptap-table-plus-plus'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TextAlign from '@tiptap/extension-text-align'
import Typography from '@tiptap/extension-typography'
import StarterKit from '@tiptap/starter-kit'
import { ImageUploadNode } from './components/tiptap-node/image-upload-node'
import { MAX_FILE_SIZE, handleImageUpload } from './lib/tiptap-utils'
import { LOREM_IPSUM, TABLE_TEST_DOC } from './testdata'
import { Highlight } from '@tiptap/extension-highlight'
import { Image } from '@tiptap/extension-image'
import { Selection } from '@tiptap/extensions'
import type { UseEditorOptions } from '@tiptap/react'
import { logger as paginationLogger } from '@tiptap-boost/pagination'

paginationLogger.enable()

export const EDITOR_OPTIONS: UseEditorOptions = {
  immediatelyRender: false,
  editorProps: {
    attributes: {
      autocomplete: 'off',
      autocorrect: 'off',
      autocapitalize: 'off',
      'aria-label': 'Main content area, start typing to enter text.',
      class: 'simple-editor',
    },
  },
  extensions: [
    StarterKit.configure({
      horizontalRule: false,
      link: {
        openOnClick: false,
        enableClickSelection: true,
      },
    }),
    HorizontalRule,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight.configure({ multicolor: true }),
    Image,
    Typography,
    Superscript,
    Subscript,
    Selection,
    ImageUploadNode.configure({
      accept: 'image/*',
      maxSize: MAX_FILE_SIZE,
      limit: 3,
      upload: handleImageUpload,
      onError: (error) => console.error('Upload failed:', error),
    }),
    Pagination.configure({
      header: {
        right: (page, total) => `Page ${page} of ${total}`,
        center: '<strong>My Document</strong>',
        left: null,
      },
      headerMarginOuter: '5mm',
      headerMarginInner: '3mm',
      footerMarginInner: '3mm',
      footerMarginOuter: '5mm',
      footer: { center: (page) => `${page}` },
      orphanLines: 0,
      widowLines: 0,
    }),
    // TablePlus,
    // TableRowPlus,
    // TableCellPlus,
    // TableHeaderPlus,
  ],
  content: LOREM_IPSUM,
}
