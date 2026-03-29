import { Node } from '@tiptap/pm/model';
import { Transaction } from '@tiptap/pm/state';

type Borders = {
  borderTop: string | null;
  borderRight: string | null;
  borderBottom: string | null;
  borderLeft: string | null;
};

const BORDER_KEYS: (keyof Borders)[] = [
  'borderTop',
  'borderRight',
  'borderBottom',
  'borderLeft',
];

function isRealBorder(v: any): v is string {
  return !!v && v !== BORDER_COLLAPSED_SENTINEL;
}

function getBorders(attrs: Record<string, any>): Borders {
  return {
    borderTop: attrs.borderTop || null,
    borderRight: attrs.borderRight || null,
    borderBottom: attrs.borderBottom || null,
    borderLeft: attrs.borderLeft || null,
  };
}

/** True if any side has a real (non-sentinel) border value. */
export function hasBorders(attrs: Record<string, any>): boolean {
  return BORDER_KEYS.some((k) => isRealBorder(attrs[k]));
}

interface CellInfo {
  pos: number;
  node: Node;
  rowIndex: number;
  colIndex: number;
  colspan: number;
  rowspan: number;
}

interface RowInfo {
  pos: number;
  node: Node;
  rowIndex: number;
}

export const BORDER_COLLAPSED_SENTINEL = '#COLLAPSED#'; // Sentinel value to indicate a collapsed border

/**
 * Walk the table tree and collect rows/cells with their document positions
 * and grid coordinates (accounting for colspans).
 */
function collectStructure(tableNode: Node, tablePos: number) {
  const rows: RowInfo[] = [];
  const cells: CellInfo[] = [];
  let rowIndex = 0;

  const addRow = (rowNode: Node, rowPos: number) => {
    rows.push({ pos: rowPos, node: rowNode, rowIndex });
    let colIndex = 0;
    rowNode.forEach((cell, cellOffset) => {
      cells.push({
        pos: rowPos + 1 + cellOffset,
        node: cell,
        rowIndex,
        colIndex,
        colspan: cell.attrs.colspan || 1,
        rowspan: cell.attrs.rowspan || 1,
      });
      colIndex += cell.attrs.colspan || 1;
    });
    rowIndex++;
  };

  tableNode.forEach((child, offset) => {
    const childPos = tablePos + 1 + offset;
    if (child.type.name === 'tableRow') {
      addRow(child, childPos);
    } else if (child.type.name === 'tableRowGroup') {
      child.forEach((row, rowOffset) => {
        if (row.type.name === 'tableRow') {
          addRow(row, childPos + 1 + rowOffset);
        }
      });
    }
  });

  const totalRows = rowIndex;
  const maxCols = rows.reduce((max, row) => {
    const cols = cells
      .filter((c) => c.rowIndex === row.rowIndex)
      .reduce((sum, c) => sum + c.colspan, 0);
    return Math.max(max, cols);
  }, 0);

  return { rows, cells, totalRows, maxCols };
}

/**
 * Pick the winning border when two cells share an edge.
 * A real border value wins over sentinel/null.
 * If both are real, owner (first arg) wins.
 */
function pickBorder(
  owner: string | null,
  neighbor: string | null
): string | null {
  if (isRealBorder(owner)) return owner;
  if (isRealBorder(neighbor)) return neighbor;
  return null;
}

/**
 * Normalize borders for a single table:
 *
 * 1. **Inherit** table/row borders down to cells
 *    - Row borderTop/borderBottom  -> all cells in that row
 *    - Row borderLeft/borderRight  -> first/last cell in that row
 *    - Table borders              -> outer-edge cells
 *
 * 2. **Collapse** adjacent cell borders so each shared edge is stored once.
 *    Convention: the top/left cell owns the shared edge
 *    (cell.borderBottom wins over cellBelow.borderTop;
 *     cell.borderRight  wins over cellRight.borderLeft).
 *
 * 3. **Clear** table and row border attrs (they are now on cells).
 *
 * Returns true if any attrs were changed.
 */
export function normalizeTableBorders(
  tr: Transaction,
  tablePos: number
): boolean {
  console.log('Normalizing borders for table at position', tablePos);
  const tableNode = tr.doc.nodeAt(tablePos);
  console.log({ tableNode });
  if (!tableNode) return false;

  const tableBorders = getBorders(tableNode.attrs);
  // Legacy <table border="N">: applies to ALL cell edges, not just outer
  const defaultCellBorder: string | null =
    tableNode.attrs.defaultCellBorder || null;
  const { rows, cells, totalRows, maxCols } = collectStructure(
    tableNode,
    tablePos
  );
  if (cells.length === 0) return false;

  // ── Step 1: Inherit table / row borders to cells ──────────────────────

  const effective = new Map<number, Borders>();

  for (const cell of cells) {
    const row = rows.find((r) => r.rowIndex === cell.rowIndex)!;
    const rowBorders = getBorders(row.node.attrs);
    const cellBorders = getBorders(cell.node.attrs);

    const isFirstRow = cell.rowIndex === 0;
    const isLastRow = cell.rowIndex + cell.rowspan >= totalRows;
    const isFirstCol = cell.colIndex === 0;
    const isLastCol = cell.colIndex + cell.colspan >= maxCols;

    // Inherit: first real value wins (cell > row > table outer > defaultCellBorder).
    // For inner edges with no inherited value, mark as collapsed.
    const pickFirst = (...vals: (string | null)[]): string | null =>
      vals.find(isRealBorder) ?? null;

    effective.set(cell.pos, {
      // Row borderTop/Bottom apply to ALL cells in the row
      borderTop:
        pickFirst(cellBorders.borderTop, rowBorders.borderTop,
          isFirstRow ? tableBorders.borderTop : null,
          defaultCellBorder)
        || BORDER_COLLAPSED_SENTINEL,
      borderBottom:
        pickFirst(cellBorders.borderBottom, rowBorders.borderBottom,
          isLastRow ? tableBorders.borderBottom : null,
          defaultCellBorder)
        || BORDER_COLLAPSED_SENTINEL,
      // Row borderLeft/Right only apply to the first/last cell
      borderLeft:
        pickFirst(cellBorders.borderLeft,
          isFirstCol ? rowBorders.borderLeft : null,
          isFirstCol ? tableBorders.borderLeft : null,
          defaultCellBorder)
        || BORDER_COLLAPSED_SENTINEL,
      borderRight:
        pickFirst(cellBorders.borderRight,
          isLastCol ? rowBorders.borderRight : null,
          isLastCol ? tableBorders.borderRight : null,
          defaultCellBorder)
        || BORDER_COLLAPSED_SENTINEL,
    });
  }

  // ── Step 2: Collapse adjacent borders ─────────────────────────────────
  // Process in reading order so top-left cell always gets first pick.

  for (const cell of cells) {
    const mine = effective.get(cell.pos)!;

    // Shared horizontal edge with cell below
    const cellBelow = cells.find(
      (c) =>
        c.rowIndex === cell.rowIndex + cell.rowspan &&
        c.colIndex === cell.colIndex
    );
    if (cellBelow) {
      const below = effective.get(cellBelow.pos)!;
      mine.borderBottom = pickBorder(mine.borderBottom, below.borderTop);
      below.borderTop = BORDER_COLLAPSED_SENTINEL;
    }

    // Shared vertical edge with cell to the right
    const cellRight = cells.find(
      (c) =>
        c.rowIndex === cell.rowIndex &&
        c.colIndex === cell.colIndex + cell.colspan
    );
    if (cellRight) {
      const right = effective.get(cellRight.pos)!;
      mine.borderRight = pickBorder(mine.borderRight, right.borderLeft);
      right.borderLeft = BORDER_COLLAPSED_SENTINEL;
    }
  }

  // ── Step 3: Apply changes ─────────────────────────────────────────────
  // setNodeMarkup preserves content and doesn't shift positions,
  // so all collected positions remain valid throughout.

  let changed = false;

  for (const cell of cells) {
    const borders = effective.get(cell.pos)!;
    const old = cell.node.attrs;
    if (
      borders.borderTop !== old.borderTop ||
      borders.borderBottom !== old.borderBottom ||
      borders.borderLeft !== old.borderLeft ||
      borders.borderRight !== old.borderRight
    ) {
      tr.setNodeMarkup(cell.pos, undefined, { ...old, ...borders });
      changed = true;
    }
  }

  // Clear table borders and defaultCellBorder
  if (hasBorders(tableNode.attrs) || defaultCellBorder) {
    tr.setNodeMarkup(tablePos, undefined, {
      ...tableNode.attrs,
      borderTop: null,
      borderRight: null,
      borderBottom: null,
      borderLeft: null,
      defaultCellBorder: null,
    });
    changed = true;
  }

  // Clear row borders
  for (const row of rows) {
    if (hasBorders(row.node.attrs)) {
      tr.setNodeMarkup(row.pos, undefined, {
        ...row.node.attrs,
        borderTop: null,
        borderRight: null,
        borderBottom: null,
        borderLeft: null,
      });
      changed = true;
    }
  }

  return changed;
}
