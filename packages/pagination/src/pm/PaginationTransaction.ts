import type { Attrs, Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import type { SplitRegistry } from './SplitRegistry'
import type { PageMap } from './PageMap'
import { logger } from '../utils/logger'
import { canJoin } from '@tiptap/pm/transform'

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
  splitParagraphAt(
    splitPos: number,
    nodePos: number,
    nodeAttrs: Attrs,
    pageIndex: number = -1
  ): SplitResult {
    const existingSplitId = nodeAttrs.splitId as string | null | undefined
    const existingSplitPart = nodeAttrs.splitPart as string | null | undefined

    // ── Determine splitId and splitPart assignments ──────────────────────────
    //
    // Programmatic re-split of an existing fragment: preserve the splitId chain
    // so head/mid/tail are all linked. The new "middle" node becomes 'mid'.
    //
    //   head  → split → head + mid   (top stays head, bottom inserts before tail)
    //   tail  → split → mid  + tail  (top inserts after head, bottom stays tail)
    //   mid   → split → mid  + mid
    //   (none)→ split → head + tail  (fresh split, new splitId)
    let splitId: string
    let headSplitPart: 'head' | 'mid'
    let tailSplitPart: 'mid' | 'tail'

    if (existingSplitId && existingSplitPart) {
      splitId = existingSplitId
      if (existingSplitPart === 'head') {
        headSplitPart = 'head'
        tailSplitPart = 'mid'
      } else if (existingSplitPart === 'tail') {
        headSplitPart = 'mid'
        tailSplitPart = 'tail'
      } else {
        // 'mid' → both stay mid
        headSplitPart = 'mid'
        tailSplitPart = 'mid'
      }
      // Unregister the old entry — it's being replaced by two new ones below.
      this.registry.unregister(splitId, nodePos)
      logger.log(
        'split',
        `splitParagraphAt: re-splitting ${existingSplitPart} fragment at ${nodePos} (splitId ${splitId}) → ${headSplitPart} + ${tailSplitPart}`
      )
    } else {
      splitId = crypto.randomUUID()
      headSplitPart = 'head'
      tailSplitPart = 'tail'
    }

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
      splitPart: headSplitPart,
    })

    this.tr.setNodeMarkup(tailNodePos, null, {
      ...nodeAttrs,
      splitId,
      splitPart: tailSplitPart,
    })

    this.registry.register({ splitId, splitPart: headSplitPart, pos: headNodePos, pageIndex })
    this.registry.register({
      splitId,
      splitPart: tailSplitPart,
      pos: tailNodePos,
      pageIndex: pageIndex + 1,
    })

    return { headPos: headNodePos, tailPos: tailNodePos, splitId }
  }

  // ── Fuse ───────────────────────────────────────────────────────────────────

  /**
   * Join two adjacent split fragments and clean up `splitId`/`splitPart`
   * attrs if no other fragments remain for the same `splitId`.
   */
  fuseNodes(leadingPos: number, trailingPos: number, pageIndex: number): void {
    const $leading = this.tr.doc.resolve(leadingPos)
    const $trailing = this.tr.doc.resolve(trailingPos)
    const leadingNodePos = $leading.after(1)
    const trailingNodePos = $trailing.after(1)
    const leadingNode = this.tr.doc.nodeAt(leadingNodePos)
    const trailingNode = this.tr.doc.nodeAt(trailingNodePos)

    if (!leadingNode || !trailingNode) {
      logger.log(
        'split',
        `fuseNodes: no node found at leadingPos ${leadingPos} or trailingPos ${trailingPos} — skipping`,
        { leadingNode, trailingNode, leadingPos, trailingPos, doc: this.tr.doc }
      )
      return
    }
    const splitId = String(leadingNode.attrs.splitId)
    if (!splitId || splitId !== String(trailingNode.attrs.splitId)) {
      logger.log(
        'split',
        `fuseNodes: splitId mismatch or missing (leading splitId ${leadingNode.attrs.splitId}, trailing splitId ${trailingNode.attrs.splitId}) — skipping`,
        { leadingNode, trailingNode, leadingPos, trailingPos, doc: this.tr.doc }
      )
      return
    }

    const joinPos = leadingNodePos + leadingNode.nodeSize
    if (!canJoin(this.tr.doc, joinPos)) {
      logger.log(
        'split',
        `fuseNodes: nodes at ${leadingPos} and ${joinPos} are not joinable — skipping`,
        {
          leadingNode,
          trailingNode,
          leadingPos,
          trailingPos,
          joinPos,
          nodeBeforeLeading: $leading.nodeBefore,
          nodeBeforeTrailing: $trailing.nodeBefore,
          nodeAfterTrailing: $trailing.nodeAfter,
          posAfterTrailing: $trailing.after(1),
          posBeforeTrailing: $trailing.before(1),
          posBeforeLeading: $leading.before(1),
          doc: this.tr.doc,
        }
      )
      return
    }

    this.tr.join(joinPos)

    const leadingSplitPart = leadingNode.attrs.splitPart
    const trailingSplitPart = trailingNode.attrs.splitPart

    if (leadingSplitPart === 'head' && trailingSplitPart === 'tail') {
      this.registry.unregister(splitId)
    } else {
      this.registry.unregister(splitId, leadingPos)
      this.registry.unregister(splitId, trailingPos)
    }
    const remainingParts = this.registry.getParts(splitId)

    // Adjust attributes fused node
    const fusedPos = this.tr.mapping.map(leadingNodePos)
    const fusedNode = this.tr.doc.nodeAt(fusedPos)
    if (fusedNode) {
      const newAttrs = { ...fusedNode.attrs }
      if (remainingParts.length === 0) {
        newAttrs.splitId = null
        newAttrs.splitPart = null
      } else if (leadingSplitPart === 'head') {
        newAttrs.splitPart = 'head'
        this.registry.register({ splitId, splitPart: 'head', pos: fusedPos, pageIndex })
      } else if (trailingSplitPart === 'tail') {
        newAttrs.splitPart = 'tail'
        this.registry.register({ splitId, splitPart: 'tail', pos: fusedPos, pageIndex })
      } else {
        newAttrs.splitPart = 'mid'
        this.registry.register({ splitId, splitPart: 'mid', pos: fusedPos, pageIndex })
      }
      this.tr.setNodeMarkup(fusedPos, null, newAttrs)
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
