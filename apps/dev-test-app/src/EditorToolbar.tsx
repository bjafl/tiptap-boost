import { ArrowLeftIcon } from './components/tiptap-icons/arrow-left-icon'
import { HighlighterIcon } from './components/tiptap-icons/highlighter-icon'
import { LinkIcon } from './components/tiptap-icons/link-icon'
import { ThemeToggle } from './components/tiptap-templates/simple/theme-toggle'
import { Button } from './components/tiptap-ui-primitive/button'
import { Spacer } from './components/tiptap-ui-primitive/spacer'
import { ToolbarGroup, ToolbarSeparator } from './components/tiptap-ui-primitive/toolbar'
import { BlockquoteButton } from './components/tiptap-ui/blockquote-button'
import { CodeBlockButton } from './components/tiptap-ui/code-block-button'
import {
  ColorHighlightPopover,
  ColorHighlightPopoverButton,
  ColorHighlightPopoverContent,
} from './components/tiptap-ui/color-highlight-popover'
import { HeadingDropdownMenu } from './components/tiptap-ui/heading-dropdown-menu'
import { ImageUploadButton } from './components/tiptap-ui/image-upload-button'
import { LinkPopover, LinkButton, LinkContent } from './components/tiptap-ui/link-popover'
import { ListDropdownMenu } from './components/tiptap-ui/list-dropdown-menu'
import { MarkButton } from './components/tiptap-ui/mark-button'
import { TextAlignButton } from './components/tiptap-ui/text-align-button'
import { UndoRedoButton } from './components/tiptap-ui/undo-redo-button'

export const MainToolbarContent = ({
  onHighlighterClick,
  onLinkClick,
  isMobile,
}: {
  onHighlighterClick: () => void
  onLinkClick: () => void
  isMobile: boolean
}) => {
  return (
    <>
      <Spacer />

      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu modal={false} levels={[1, 2, 3, 4]} />
        <ListDropdownMenu modal={false} types={['bulletList', 'orderedList', 'taskList']} />
        <BlockquoteButton />
        <CodeBlockButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="code" />
        <MarkButton type="underline" />
        {!isMobile ? (
          <ColorHighlightPopover />
        ) : (
          <ColorHighlightPopoverButton onClick={onHighlighterClick} />
        )}
        {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="superscript" />
        <MarkButton type="subscript" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ImageUploadButton text="Add" />
      </ToolbarGroup>

      <Spacer />

      {isMobile && <ToolbarSeparator />}

      <ToolbarGroup>
        <ThemeToggle />
      </ToolbarGroup>
    </>
  )
}

export const MobileToolbarContent = ({
  type,
  onBack,
}: {
  type: 'highlighter' | 'link'
  onBack: () => void
}) => (
  <>
    <ToolbarGroup>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeftIcon className="tiptap-button-icon" />
        {type === 'highlighter' ? (
          <HighlighterIcon className="tiptap-button-icon" />
        ) : (
          <LinkIcon className="tiptap-button-icon" />
        )}
      </Button>
    </ToolbarGroup>

    <ToolbarSeparator />

    {type === 'highlighter' ? <ColorHighlightPopoverContent /> : <LinkContent />}
  </>
)
