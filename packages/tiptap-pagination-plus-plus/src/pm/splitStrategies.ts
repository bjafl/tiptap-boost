import { EditorView } from '@tiptap/pm/view'
import { Node as PMNode, NodeType, ResolvedPos } from '@tiptap/pm/model'
import type { Attrs } from '@tiptap/pm/model'
import { DomColumnHeight } from '../utils/DomSizeCalculator'

export interface SplitRequest {
  pos: number
  depth: number
  typesAfter: { type: NodeType; attrs: Attrs | null }[]
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Returns a SplitRequest for node types that support splitting, or null
 * if the node type is unsupported or the split would be a no-op.
 */
export function findSplitRequest(
  view: EditorView,
  node: PMNode,
  offset: number,
  dom: HTMLElement,
  remainingHeight: number,
  appliedSplitPositions: Set<number>
): SplitRequest | null {
  switch (node.type.name) {
    case 'paragraph':
    case 'heading':
    case 'blockquote':
      return findTextSplit(view, node, offset, dom, remainingHeight, appliedSplitPositions)

    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return findListSplit(view, node, offset, remainingHeight, appliedSplitPositions)

    case 'table':
      return findTableSplit(view, node, offset, remainingHeight, appliedSplitPositions)

    default:
      return null
  }
}

// ─── Text / paragraph ─────────────────────────────────────────────────────────

/**
 * Splits a paragraph/heading/blockquote at a line boundary that fits within
 * `remainingHeight`. Uses coordsAtPos binary search so the split always lands
 * at a clean line start, never mid-word.
 */
function findTextSplit(
  view: EditorView,
  node: PMNode,
  offset: number,
  dom: HTMLElement,
  remainingHeight: number,
  appliedSplitPositions: Set<number>
): SplitRequest | null {
  const domRect = dom.getBoundingClientRect()
  const pageBreakY = domRect.top + remainingHeight

  if (pageBreakY >= domRect.bottom || pageBreakY <= domRect.top) return null

  const splitPos = findLineBoundary(view, offset + 1, offset + node.nodeSize - 1, pageBreakY)
  if (splitPos === null) return null
  if (appliedSplitPositions.has(splitPos)) return null
  appliedSplitPositions.add(splitPos)

  const $pos = view.state.doc.resolve(splitPos)
  if ($pos.parentOffset === 0 || $pos.parentOffset === $pos.parent.content.size) return null

  return { pos: splitPos, depth: $pos.depth, typesAfter: buildTypesAfter($pos) }
}

/**
 * Binary-searches [lo, hi] for the last PM position whose line-top is
 * strictly less than `pageBreakY`, then finds where the next line begins.
 * Returns the next-line start so the first half ends at a clean line boundary.
 */
function findLineBoundary(
  view: EditorView,
  lo: number,
  hi: number,
  pageBreakY: number
): number | null {
  // Pass 1: rightmost position on a fitting line.
  let fittingPos: number | null = null
  let searchLo = lo
  let searchHi = hi

  while (searchLo <= searchHi) {
    const mid = (searchLo + searchHi) >> 1
    const y = posLineTop(view, mid)
    if (y === null) { searchLo = mid + 1; continue }

    if (y < pageBreakY) { fittingPos = mid; searchLo = mid + 1 }
    else { searchHi = mid - 1 }
  }

  if (fittingPos === null) return null
  const fittingLineTop = posLineTop(view, fittingPos)
  if (fittingLineTop === null) return null

  // Pass 2: first position on the line after fittingPos.
  searchLo = fittingPos + 1
  searchHi = hi
  let nextLineStart: number | null = null

  while (searchLo <= searchHi) {
    const mid = (searchLo + searchHi) >> 1
    const y = posLineTop(view, mid)
    if (y === null) { searchLo = mid + 1; continue }

    if (y > fittingLineTop) { nextLineStart = mid; searchHi = mid - 1 }
    else { searchLo = mid + 1 }
  }

  return nextLineStart ?? fittingPos
}

function posLineTop(view: EditorView, pos: number): number | null {
  try { return view.coordsAtPos(pos).top }
  catch { return null }
}

// ─── List ─────────────────────────────────────────────────────────────────────

/**
 * Splits a list between list items — never inside an item.
 */
function findListSplit(
  view: EditorView,
  listNode: PMNode,
  listOffset: number,
  remainingHeight: number,
  appliedSplitPositions: Set<number>
): SplitRequest | null {
  return findChildBoundarySplit(view, listNode, listOffset, remainingHeight, appliedSplitPositions)
}

// ─── Table ────────────────────────────────────────────────────────────────────

/**
 * Splits a table between rows — never mid-cell.
 * Handles both flat (table > row) and sectioned (table > thead/tbody/tfoot > row) schemas.
 */
function findTableSplit(
  view: EditorView,
  tableNode: PMNode,
  tableOffset: number,
  remainingHeight: number,
  appliedSplitPositions: Set<number>
): SplitRequest | null {
  // Flatten to a list of {row, absOffset} regardless of whether sections exist.
  const rows: { node: PMNode; absOffset: number }[] = []
  tableNode.forEach((child, childOffset) => {
    const absChild = tableOffset + 1 + childOffset
    if (child.type.name === 'tableRow') {
      rows.push({ node: child, absOffset: absChild })
    } else {
      child.forEach((row, rowOffset) => {
        rows.push({ node: row, absOffset: absChild + 1 + rowOffset })
      })
    }
  })

  const colHeight = new DomColumnHeight(remainingHeight)
  let lastFitPos: number | null = null

  for (const { node, absOffset } of rows) {
    const rowDom = view.nodeDOM(absOffset)
    if (!(rowDom instanceof HTMLElement)) break
    if (!colHeight.tryAddChild(rowDom)) break
    lastFitPos = absOffset + node.nodeSize
  }

  if (lastFitPos === null) return null
  if (appliedSplitPositions.has(lastFitPos)) return null
  appliedSplitPositions.add(lastFitPos)

  const $pos = view.state.doc.resolve(lastFitPos)
  return { pos: lastFitPos, depth: $pos.depth, typesAfter: buildTypesAfter($pos) }
}

// ─── Shared ───────────────────────────────────────────────────────────────────

/**
 * Generic helper for list-like nodes: iterates direct children, accumulates
 * their heights, and returns a split at the last child boundary that fits.
 * `getRows` unwraps a child into the rows to measure (identity for lists).
 */
function findChildBoundarySplit(
  view: EditorView,
  parentNode: PMNode,
  parentOffset: number,
  remainingHeight: number,
  appliedSplitPositions: Set<number>
): SplitRequest | null {
  const colHeight = new DomColumnHeight(remainingHeight)
  let lastFitPos: number | null = null

  let childOffset = 0
  for (let i = 0; i < parentNode.childCount; i++) {
    const child = parentNode.child(i)
    const absOffset = parentOffset + 1 + childOffset
    const dom = view.nodeDOM(absOffset)
    if (!(dom instanceof HTMLElement)) break
    if (!colHeight.tryAddChild(dom)) break
    lastFitPos = absOffset + child.nodeSize
    childOffset += child.nodeSize
  }

  if (lastFitPos === null) return null
  if (appliedSplitPositions.has(lastFitPos)) return null
  appliedSplitPositions.add(lastFitPos)

  const $pos = view.state.doc.resolve(lastFitPos)
  return { pos: lastFitPos, depth: $pos.depth, typesAfter: buildTypesAfter($pos) }
}

/**
 * Builds the typesAfter array for tr.split(), innermost → outermost,
 * preserving attrs (alignment, list type, etc.) on every new node.
 */
function buildTypesAfter($pos: ResolvedPos): { type: NodeType; attrs: Attrs | null }[] {
  const typesAfter: { type: NodeType; attrs: Attrs | null }[] = []
  for (let d = $pos.depth; d > 0; d--) {
    const ancestor = $pos.node(d)
    typesAfter.push({ type: ancestor.type, attrs: ancestor.attrs })
  }
  return typesAfter
}
