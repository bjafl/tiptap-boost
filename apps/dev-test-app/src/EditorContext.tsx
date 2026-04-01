import { useContext } from 'react'
import { EditorContext, useEditor, type UseEditorOptions } from '@tiptap/react'

// --- Tiptap Core Extensions ---
import { StarterKit } from '@tiptap/starter-kit'
import { Image } from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TextAlign } from '@tiptap/extension-text-align'
import { Typography } from '@tiptap/extension-typography'
import { Highlight } from '@tiptap/extension-highlight'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { Selection } from '@tiptap/extensions'

// --- Tiptap Node ---
import { ImageUploadNode } from '@/components/tiptap-node/image-upload-node/image-upload-node-extension'
import { HorizontalRule } from '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension'
import '@/components/tiptap-node/blockquote-node/blockquote-node.scss'
import '@/components/tiptap-node/code-block-node/code-block-node.scss'
import '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss'
import '@/components/tiptap-node/list-node/list-node.scss'
import '@/components/tiptap-node/image-node/image-node.scss'
import '@/components/tiptap-node/heading-node/heading-node.scss'
import '@/components/tiptap-node/paragraph-node/paragraph-node.scss'

// --- Lib ---
import { handleImageUpload, MAX_FILE_SIZE } from '@/lib/tiptap-utils'

// --- Styles ---
import '@/components/tiptap-templates/simple/simple-editor.scss'

import content from '@/components/tiptap-templates/simple/data/content.json'

const DEFAULT_EDITOR_OPTIONS: UseEditorOptions = {
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
  ],
  content,
}
export function EditorContextProvider({
  children,
  editorOptions: editorProps,
}: {
  children: React.ReactNode
  editorOptions?: UseEditorOptions
}) {
  const editor = useEditor(editorProps ? editorProps : DEFAULT_EDITOR_OPTIONS)
  console.log('[TEST CTX]', 'Initialized editor')
  return <EditorContext.Provider value={{ editor }}>{children}</EditorContext.Provider>
}

export function useEditorContext() {
  const context = useContext(EditorContext)
  if (!context) {
    throw new Error('useEditorContext must be used within an EditorContextProvider')
  }
  return context
}
