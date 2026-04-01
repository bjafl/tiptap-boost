import { EDITOR_OPTIONS } from './config'
import { SimpleEditor } from './Editor'
import { EditorContextProvider } from './EditorContext'
import { Tests } from './Tests'

export default function App() {
  return (
    <EditorContextProvider editorOptions={EDITOR_OPTIONS}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          height: '100vh',
        }}
      >
        <div style={{ display: 'flex', flexGrow: 1, width: '100%', height: '100%' }}>
          <SimpleEditor />
        </div>
        <div
          style={{ display: 'flex', flexDirection: 'column', minWidth: '200px', padding: '16px' }}
        >
          <Tests />
        </div>
      </div>
    </EditorContextProvider>
  )
}
