import { useEffect, useRef, useState } from 'react'
import { EditorContent } from '@tiptap/react'
import { Toolbar } from '@/components/tiptap-ui-primitive/toolbar'
import { useIsBreakpoint } from '@/hooks/use-is-breakpoint'
import { useWindowSize } from '@/hooks/use-window-size'
import { useCursorVisibility } from '@/hooks/use-cursor-visibility'
import { useEditorContext } from './EditorContext'
import { MainToolbarContent, MobileToolbarContent } from './EditorToolbar'

export function SimpleEditor() {
  const isMobile = useIsBreakpoint()
  const { height } = useWindowSize()
  const [mobileView, setMobileView] = useState<'main' | 'highlighter' | 'link'>('main')
  const toolbarRef = useRef<HTMLDivElement>(null)

  const { editor } = useEditorContext()

  const rect = useCursorVisibility({
    editor,
    overlayHeight: toolbarRef.current?.getBoundingClientRect().height ?? 0,
  })

  useEffect(() => {
    if (!isMobile && mobileView !== 'main') {
      setMobileView('main')
    }
  }, [isMobile, mobileView])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Toolbar
        ref={toolbarRef}
        style={{
          ...(isMobile
            ? {
                bottom: `calc(100% - ${height - rect.y}px)`,
              }
            : {}),
        }}
      >
        {mobileView === 'main' ? (
          <MainToolbarContent
            onHighlighterClick={() => setMobileView('highlighter')}
            onLinkClick={() => setMobileView('link')}
            isMobile={isMobile}
          />
        ) : (
          <MobileToolbarContent
            type={mobileView === 'highlighter' ? 'highlighter' : 'link'}
            onBack={() => setMobileView('main')}
          />
        )}
      </Toolbar>

      <EditorContent
        editor={editor}
        role="presentation"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
