import type { Node as PMNode } from '@tiptap/pm/model'
// TableMap is imported from the prosemirror-tables package via tiptap
import { TableMap } from '@tiptap/pm/tables'

export interface TableSplitPlan {
  /**
   * Row index to split BEFORE (0-based).
   * `null` means the whole table should be moved to the next page.
   */
  splitBeforeRow: number | null
  /** Row indices blocked by a rowspan crossing — never safe to split here. */
  unsafeRows: Set<number>
  /** All row indices that are safe split points. */
  safeRows: number[]
  /** Accumulated DOM height per row in px. */
  rowHeights: number[]
}

/**
 * Analyses a table node to find the optimal row boundary to split on,
 * respecting rowspan constraints.
 *
 * Uses `TableMap` from `@tiptap/extension-table` (re-exports from
 * `prosemirror-tables`) to identify cells that span multiple rows.
 */
export class TableSplitAnalyzer {
  /**
   * Analyse `tableNode` and return a split plan, or `null` if the table fits
   * entirely within `remainingHeight`.
   *
   * @param tableNode       The ProseMirror table node
   * @param tableDOM        The rendered `<table>` element
   * @param remainingHeight Available height on the current page in px
   */
  analyze(
    tableNode: PMNode,
    tableDOM: HTMLElement,
    remainingHeight: number
  ): TableSplitPlan | null {
    const tableMap = TableMap.get(tableNode)
    const rows = Array.from(tableDOM.querySelectorAll('tr')) as HTMLElement[]

    if (rows.length === 0) return null

    // ── Measure row heights ────────────────────────────────────────────────
    const rowHeights = rows.map((row) => row.getBoundingClientRect().height)

    // ── Find rows unsafe to split before (rowspan crosses the boundary) ──
    const unsafeRows = this.buildUnsafeRows(tableMap)

    // ── Find safe rows ────────────────────────────────────────────────────
    // Row 0 is never a valid "split before" candidate (nothing would stay).
    const safeRows = rows.map((_, i) => i).filter((i) => i > 0 && !unsafeRows.has(i))

    // ── Find the last safe row that fits within remainingHeight ──────────
    let accumulated = 0
    let splitBeforeRow: number | null = null

    for (let i = 0; i < rows.length; i++) {
      accumulated += rowHeights[i]

      if (accumulated > remainingHeight) {
        // We've exceeded the space — find the last safe row at or before i
        for (let candidate = i; candidate >= 1; candidate--) {
          if (!unsafeRows.has(candidate)) {
            splitBeforeRow = candidate
            break
          }
        }
        break
      }
    }

    // Table fits entirely
    if (splitBeforeRow === null && accumulated <= remainingHeight) {
      return null
    }

    return { splitBeforeRow, unsafeRows, safeRows, rowHeights }
  }

  /**
   * Check whether it is safe to split immediately before `rowIndex`.
   */
  isRowSafe(tableNode: PMNode, rowIndex: number): boolean {
    if (rowIndex === 0) return false
    const unsafeRows = this.buildUnsafeRows(TableMap.get(tableNode))
    return !unsafeRows.has(rowIndex)
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Build the set of row indices where a split is unsafe because a cell
   * with rowspan > 1 crosses from the row above into this row.
   */
  private buildUnsafeRows(tableMap: TableMap): Set<number> {
    const unsafe = new Set<number>()

    for (let row = 0; row < tableMap.height; row++) {
      for (let col = 0; col < tableMap.width; col++) {
        const cellPos = tableMap.map[row * tableMap.width + col]
        const rect = tableMap.findCell(cellPos)

        // If a cell spans more than one row, all rows after the first are unsafe
        if (rect.bottom > rect.top + 1) {
          for (let r = rect.top + 1; r < rect.bottom; r++) {
            unsafe.add(r)
          }
        }
      }
    }

    return unsafe
  }
}
