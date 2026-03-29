import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { PdfExtension } from '../src'

export default function App() {
  const editor = useEditor({
    extensions: [StarterKit, PdfExtension],
    content: '<p>@tiptap-boost/pdf sandbox 👋</p>',
  })

  return <EditorContent editor={editor} />
}
