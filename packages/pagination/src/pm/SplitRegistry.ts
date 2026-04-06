import type { Node as PMNode } from '@tiptap/pm/model'
import type { Mapping } from '@tiptap/pm/transform'
import type { SplitEntry, SplitPart } from '../types'
import type { PageMap } from './PageMap'

export type { SplitEntry }

/**
 * Incremental index of all split node fragments in the document.
 *
 * Avoids full `doc.descendants` traversal when searching for fusion
 * candidates — only the registered entries are inspected.
 *
 * Must be kept in sync with the document via:
 *   - `register` / `unregister` after each split/fuse
 *   - `applyMapping` after every transaction
 *   - `syncPageIndexes` after the `PageMap` is updated
 *   - `rebuild` as a fallback after desync
 */
export class SplitRegistry {
  /** splitId → all fragments for that split */
  private entries: Map<string, SplitEntry[]> = new Map()

  get size(): number {
    let count = 0
    for (const parts of this.entries.values()) count += parts.length
    return count
  }

  // ── Register / unregister ──────────────────────────────────────────────────

  register(entry: SplitEntry): void {
    const parts = this.entries.get(entry.splitId) ?? []
    parts.push(entry)
    this.entries.set(entry.splitId, parts)
  }

  unregister(splitId: string, pos?: number): void {
    if (pos === undefined) {
      this.entries.delete(splitId)
      return
    }
    const parts = this.entries.get(splitId)
    if (!parts) return

    const idx = parts.findIndex((e) => e.pos === pos)
    if (idx !== -1) parts.splice(idx, 1)

    if (parts.length === 0) {
      this.entries.delete(splitId)
    }
  }

  getParts(splitId: string): SplitEntry[] {
    return this.entries.get(splitId) ?? []
  }

  // ── Fusion candidates ──────────────────────────────────────────────────────

  /**
   * Find all adjacent head→tail (or mid to any) pairs that landed on the same
   * page — these should be fused.
   *
   * Returns pairs sorted by ascending position so they can be fused from
   * bottom to top (to avoid position invalidation).
   */
  findFusionCandidates(): Array<{ leading: SplitEntry; trailing: SplitEntry }> {
    const candidates: Array<{ leading: SplitEntry; trailing: SplitEntry }> = []

    for (const [, parts] of this.entries) {
      // Sort by position so head always comes before tail
      const sorted = [...parts].sort((a, b) => a.pos - b.pos)

      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i]
        const next = sorted[i + 1]

        const curIsHeadMid = current.splitPart === 'head' || current.splitPart === 'mid'
        const nextIsTailMid = next.splitPart === 'tail' || next.splitPart === 'mid'
        const samePage = current.pageIndex === next.pageIndex

        if (curIsHeadMid && nextIsTailMid && samePage) {
          candidates.push({ leading: current, trailing: next })
        }
      }
    }

    // Sort descending by position so the caller can fuse from bottom to top
    return candidates.sort((a, b) => b.leading.pos - a.leading.pos)
  }

  // ── Position sync ──────────────────────────────────────────────────────────

  /**
   * Map all stored positions through a PM transaction mapping.
   * Call after every transaction that changes the document.
   */
  applyMapping(mapping: Mapping): void {
    for (const parts of this.entries.values()) {
      for (const entry of parts) {
        entry.pos = mapping.map(entry.pos)
      }
    }
  }

  /**
   * Update page indices from the current `PageMap`.
   * Call after `PageMap` has been updated following a reflow.
   */
  syncPageIndexes(pageMap: PageMap): void {
    for (const parts of this.entries.values()) {
      for (const entry of parts) {
        const page = pageMap.pageForPos(entry.pos)
        entry.pageIndex = page?.pageIndex ?? -1
      }
    }
  }

  // ── Rebuild ────────────────────────────────────────────────────────────────

  /**
   * Full reconstruction from the document.
   * Scans `doc.descendants` for nodes with `splitId` attrs.
   * Use as a fallback when incremental tracking gets out of sync.
   */
  rebuild(doc: PMNode, pageMap: PageMap): void {
    this.entries.clear()

    doc.descendants((node, pos) => {
      const { splitId, splitPart } = node.attrs as {
        splitId?: string | null
        splitPart?: SplitPart | null
      }

      if (!splitId || !splitPart) return

      const page = pageMap.pageForPos(pos)
      this.register({
        splitId,
        splitPart,
        pos,
        pageIndex: page?.pageIndex ?? -1,
      })
    })
  }
}
