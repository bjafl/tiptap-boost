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
   * Split the node at `splitPos` (a content position inside the node),
   * mark both halves with a new `splitId`, and register them in the registry.
   *
   * @param splitPos  Content position inside the node where the split occurs
   *                  (the value returned by `TextSplitFinder.toPmPos`)
   * @param nodePos   Block position of the paragraph node itself — the position
   *                  you would pass to `view.nodeDOM(nodePos)`.  Must NOT be a
   *                  text/content position; must be the node's own opening position.
   * @param nodeAttrs Attrs of the original node (preserved on both halves)
   * @param pageIndex Page index the head lands on (for registry initialisation)
   */
  splitParagraphAt(splitPos: number, nodePos: number, nodeAttrs: Attrs, pageIndex: number = -1): SplitResult {
    const splitId = crypto.randomUUID()

    // tr.split inserts a close + open token pair at splitPos.
    // StepMap: oldStart=splitPos, oldEnd=splitPos, newSize=2 (2 tokens inserted).
    //
    // After the split:
    //   splitPos + 0  = close token of head paragraph
    //   splitPos + 1  = open token of tail paragraph  ← the tail's block position
    //   splitPos + 2  = first content position inside tail
    //
    // mapping.map(splitPos, +1)  = splitPos + 2  (past insertion, default bias)
    // mapping.map(splitPos, -1)  = splitPos       (before insertion)
    //
    // Tail node block position = splitPos + 1 = mapping.map(splitPos, -1) + 1
    this.tr.split(splitPos)

    const headNodePos = nodePos
    const tailNodePos = this.tr.mapping.map(splitPos, -1) + 1

    this.tr.setNodeMarkup(headNodePos, null, {
      ...nodeAttrs,
      splitId,
      splitPart: 'head',
    })

    this.tr.setNodeMarkup(tailNodePos, null, {
      ...nodeAttrs,
      splitId,
      splitPart: 'tail',
    })

    this.registry.register({ splitId, splitPart: 'head', pos: headNodePos, pageIndex })
    this.registry.register({ splitId, splitPart: 'tail', pos: tailNodePos, pageIndex: pageIndex + 1 })

    return { headPos: headNodePos, tailPos: tailNodePos, splitId }
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

    const page = pageMap.getPage(pageIdx)
    if (!page) return

    const oldEndPos = page.endPos
    pageMap.setSplitBoundary(pageIdx, nodePos)

    // If this was the last page, content from nodePos to oldEndPos has no
    // page to land on — insert a new page to absorb it.
    if (!pageMap.getPage(pageIdx + 1)) {
      pageMap.insertPageAfter(pageIdx, nodePos, oldEndPos)
    }
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
