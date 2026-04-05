import {
  PAGE_SIZES,
  type PageSize,
  type PaginationPlusExtension,
} from '@tiptap-boost/tiptap-pagination-plus-plus'
import { useEditorContext } from './EditorContext'
import { useCallback, useEffect, useMemo, useState } from 'react'

function testLog(message: string, data?: any) {
  console.log(`[TESTS] ${message}`, data ?? '')
}

export function Tests() {
  const [pageSize, setPageSize] = useState<PageSize | undefined>()
  const { editor } = useEditorContext()

  const getPaginationExtension = useCallback((): PaginationPlusExtension | undefined => {
    testLog('getting PaginationPlus extension from editor...', { editor })
    const ext = editor?.extensionManager.extensions.find((e) => e.name === 'PaginationPlus')
    if (!ext) return undefined
    testLog('Found PaginationPlus extension:', { ext, storage: ext.storage })

    return ext as PaginationPlusExtension
  }, [editor])

  const readPageSize = () => {
    const ext = getPaginationExtension()
    if (!ext) {
      //testLog('PaginationPlus extension not found.')
      setPageSize(undefined)
      return
    }
    //testLog('Reading page size from extension storage:', {
    //   storage: { ...ext.storage },
    // })
    const size = ext.storage.pageSize
    testLog('Current page size:', { ...size })
    setPageSize(size)
  }

  // useEffect(() => {
  //   const id = setInterval(() => readPageSize(), 2000)
  //   return () => clearInterval(id)
  // }, [readPageSize])

  useEffect(() => {
    const handleTransaction = () => {
      // testLog('Editor transaction occurred, checking for page size updates...')
      // readPageSize()
      // const id = setInterval(() => readPageSize(), 1000)
      // setTimeout(() => clearInterval(id), 5000)
    }
    editor?.on('transaction', handleTransaction)
    return () => {
      editor?.off('transaction', handleTransaction)
    }
  }, [editor, readPageSize])

  useEffect(() => {
    if (!editor) return
    testLog('Editor loaded, reading initial page size...')
    readPageSize()
  }, [readPageSize, editor])

  const updatePageSize = useCallback(
    (size: PageSize) => {
      const result = editor?.commands.updatePageSize({ size })

      testLog('updatePageSize command executed with size:', { size, result })
    },
    [editor]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <p>TESTS</p>
      {editor === null ? (
        <p>Waiting for editor initialization...</p>
      ) : (
        <>
          <p>Page Size:</p>
          <p>
            Current: <PageSizeDisplay pageSize={pageSize} />
          </p>
          <button onClick={() => updatePageSize({ height: 1123, width: 794 })}>A4</button>
          <button onClick={() => updatePageSize({ height: 1060, width: 818 })}>Letter</button>
          <button onClick={() => updatePageSize({ height: 1404, width: 818 })}>Legal</button>
        </>
      )}
    </div>
  )
}

function PageSizeDisplay({ pageSize }: { pageSize?: PageSize }) {
  if (!pageSize) {
    return <span style={{ fontSize: '0.75em', color: '#888' }}>Value not found...</span>
  }
  const { width, height } = pageSize
  return (
    <span style={{ fontSize: '0.75em', color: '#888' }}>
      {width}×{height}px ·{/* margins: {marginTop}/{marginRight}/{marginBottom}/{marginLeft} */}
    </span>
  )
}
