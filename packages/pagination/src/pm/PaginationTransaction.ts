import type { Attrs, Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import type { SplitRegistry } from './SplitRegistry'
import type { PageMap } from './PageMap'

export interface SplitResult {
  headPos: number
  tailPos: number
  splitId: string
}

/**
 * Builder wrapper around a ProseMirror `Transaction` that handles
 * common pagination operations (split, fuse, promote, move) while
 * keeping `SplitRegistry` in sync.
 *
 * All mutations are applied to the same underlying `tr`. Call `finalize()`
 * to set `addToHistory: false` and retrieve it.
 *
 * Usage:
 * ```ts
 * const ptx = new PaginationTransaction(view.state.tr, registry)
 * const { headPos, tailPos } = ptx.splitParagraphAt(pos, node.attrs)
 * view.dispatch(ptx.finalize())
 * ```
 */
export class PaginationTransaction {
  readonly tr: Transaction
  private readonly registry: SplitRegistry

  constructor(tr: Transaction, registry: SplitRegistry) {
    this.tr = tr
    this.registry = registry
  }

  // ── Split ──────────────────────────────────────────────────────────────────

  /**
   * Split the node at `pos`, mark both halves with a new `splitId`,
   * and register them in the `SplitRegistry`.
   *
   * @param pos       The PM position inside the node to split at
   * @param nodeAttrs The attrs of the original node (to preserve on both halves)
   * @param pageIndex The page index the head lands on (for registry initialisation)
   */
  splitParagraphAt(pos: number, nodeAttrs: Attrs, pageIndex: number = -1): SplitResult {
    const splitId = crypto.randomUUID()
    const headPos = this.tr.mapping.map(pos - 1) // start of the node before split

    this.tr.split(pos)

    // After split, the tail node starts at the mapped position of `pos` + 1
    const tailPos = this.tr.mapping.map(pos) + 1

    // Mark head
    this.tr.setNodeMarkup(this.tr.mapping.map(headPos, -1), null, {
      ...nodeAttrs,
      splitId,
      splitPart: 'head',
    })

    // Mark tail
    this.tr.setNodeMarkup(tailPos, null, {
      ...nodeAttrs,
      splitId,
      splitPart: 'tail',
    })

    this.registry.register({
      splitId,
      splitPart: 'head',
      pos: this.tr.mapping.map(headPos, -1),
      pageIndex,
    })
    this.registry.register({ splitId, splitPart: 'tail', pos: tailPos, pageIndex: pageIndex + 1 })

    return { headPos: this.tr.mapping.map(headPos, -1), tailPos, splitId }
  }

  // ── Fuse ───────────────────────────────────────────────────────────────────

  /**
   * Join two adjacent split fragments and clean up `splitId`/`splitPart`
   * attrs if no other fragments remain for the same `splitId`.
   */
  fuseNodes(headPos: number, tailPos: number): void {
    const headNode = this.tr.doc.nodeAt(headPos) as PMNode | null
    if (!headNode) return

    const splitId: string = headNode.attrs.splitId
    const joinPos = headPos + headNode.nodeSize

    this.tr.join(joinPos)

    this.registry.unregister(splitId, headPos)
    this.registry.unregister(splitId, tailPos)

    // If no parts remain, remove attrs from the fused node
    const remainingParts = this.registry.getParts(splitId)
    if (remainingParts.length === 0) {
      const fusedPos = this.tr.mapping.map(headPos)
      const fusedNode = this.tr.doc.nodeAt(fusedPos)
      if (fusedNode) {
        this.tr.setNodeMarkup(fusedPos, null, {
          ...fusedNode.attrs,
          splitId: null,
          splitPart: null,
        })
      }
    }
  }

  // ── Promote ────────────────────────────────────────────────────────────────

  /**
   * Promote a `tail` fragment to `mid` when a further split is needed
   * (paragraph spans more than two pages).
   */
  promoteToMid(pos: number): void {
    const node = this.tr.doc.nodeAt(pos)
    if (!node) return

    this.tr.setNodeMarkup(pos, null, {
      ...node.attrs,
      splitPart: 'mid',
    })

    const splitId: string = node.attrs.splitId
    const entry = this.registry.getParts(splitId).find((e) => e.pos === pos)
    if (entry) entry.splitPart = 'mid'
  }

  // ── Move between pages ─────────────────────────────────────────────────────

  /**
   * Move a block node from its current page to the next by adjusting the
   * `PageMap` boundary. Does NOT physically move the node in the document —
   * the boundary is just shifted before it.
   */
  moveToNextPage(nodePos: number, pageMap: PageMap): void {
    const pageIdx = pageMap.pageIndexForPos(nodePos)
    if (pageIdx === -1) return
    pageMap.setSplitBoundary(pageIdx, nodePos)
  }

  /**
   * Pull the first node of the next page onto the current page by shifting
   * the `PageMap` boundary past it.
   */
  pullFromNextPage(pageIndex: number, pageMap: PageMap): void {
    const nextPage = pageMap.getPage(pageIndex + 1)
    if (!nextPage) return

    const firstNodeOnNextPage = nextPage.startPos
    const firstNode = this.tr.doc.nodeAt(firstNodeOnNextPage)
    if (!firstNode) return

    const newBoundary = firstNodeOnNextPage + firstNode.nodeSize
    pageMap.setSplitBoundary(pageIndex, newBoundary)
  }

  // ── Finalize ───────────────────────────────────────────────────────────────

  /**
   * Mark the transaction as not adding to history and return it.
   * Always call this before dispatching.
   */
  finalize(): Transaction {
    this.tr.setMeta('addToHistory', false)
    return this.tr
  }
}
