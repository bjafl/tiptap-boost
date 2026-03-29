
# Tiptap Table Plus Plus

Extended version of [tiptap-table-plus](https://github.com/RomikMakavana/tiptap-table-plus), adding support for **table/row/cell styling**, **per-side borders**, and **inline CSS parsing** on top of the original column/row duplication and pagination features.

## What's New (vs. tiptap-table-plus)

- **Per-side border attributes** on tables, rows, and cells (`borderTop`, `borderRight`, `borderBottom`, `borderLeft`)
- **Styling attributes** — `backgroundColor`, `padding`, `textAlign`, `verticalAlign`, `width`, `height`
- **Border collapsing & normalization** — table/row borders automatically inherit down to cells; adjacent borders are collapsed so each shared edge is stored once
- **CSS inline style parser** — zero-dependency parser that reads inline `style` attributes, expands shorthand (e.g. `border`, `padding`, `margin`), and returns atomic values

All original features are preserved: `duplicateColumn`, `duplicateRow`, column resizing, row grouping, and pagination support.

## Installation

Tiptap **v3** only.

```bash
npm install tiptap-table-plus-plus
```

### Peer Dependencies

```bash
npm install @tiptap/core @tiptap/extension-table @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/extension-table-row @tiptap/pm
```

## Usage

### Without Pagination

```js
import { Editor } from '@tiptap/core';
import { WithoutPagination } from 'tiptap-table-plus-plus';

const { TablePlus, TableCellPlus, TableHeaderPlus, TableRowPlus } = WithoutPagination;

const editor = new Editor({
  extensions: [
    TablePlus,
    TableCellPlus,
    TableHeaderPlus,
    TableRowPlus,
  ],
  content: '<table><tr><th><p>Name</p></th><th><p>Country</p></th></tr><tr><td><p>Alice</p></td><td><p>Norway</p></td></tr></table>',
});
```

### With Pagination

```js
import { Editor } from '@tiptap/core';
import { TablePlus, TableCellPlus, TableHeaderPlus, TableRowPlus } from 'tiptap-table-plus-plus';
import { PaginationPlus } from 'tiptap-pagination-plus';

const editor = new Editor({
  extensions: [
    TablePlus,
    TableRowPlus,
    TableCellPlus,
    TableHeaderPlus,
    PaginationPlus,
  ],
});
```

## Commands

| Command           | Parameters              | Default | Description                                                        |
| ----------------- | ----------------------- | ------- | ------------------------------------------------------------------ |
| `duplicateColumn` | `withContent` (boolean) | `true`  | Duplicate the current column, optionally copying content.          |
| `duplicateRow`    | `withContent` (boolean) | `true`  | Duplicate the current row, optionally copying content.             |

## Styling Attributes

Attributes are parsed from inline `style` on the HTML element and serialized back on render.

### Cell (`<td>` / `<th>`)

| Attribute        | Example Value          |
| ---------------- | ---------------------- |
| `backgroundColor`| `#f0f0f0`              |
| `padding`        | `8px 4px`              |
| `textAlign`      | `center`               |
| `verticalAlign`  | `middle`               |
| `borderTop`      | `1px solid #000`       |
| `borderRight`    | `1px solid #000`       |
| `borderBottom`   | `1px solid #000`       |
| `borderLeft`     | `1px solid #000`       |

### Row (`<tr>`)

| Attribute        | Example Value          |
| ---------------- | ---------------------- |
| `backgroundColor`| `#fafafa`              |
| `height`         | `40px`                 |
| `borderTop`      | `2px solid red`        |
| `borderRight`    | `2px solid red`        |
| `borderBottom`   | `2px solid red`        |
| `borderLeft`     | `2px solid red`        |

### Table (`<table>`)

| Attribute        | Example Value          |
| ---------------- | ---------------------- |
| `width`          | `100%`                 |
| `backgroundColor`| `white`                |
| `columnSize`     | `25,25,25,25`          |
| `borderTop`      | `1px solid #ccc`       |
| `borderRight`    | `1px solid #ccc`       |
| `borderBottom`   | `1px solid #ccc`       |
| `borderLeft`     | `1px solid #ccc`       |

## Border Inheritance & Collapsing

Borders follow a top-down inheritance model and are automatically normalized:

1. **Table borders** are distributed to outer-edge cells only.
2. **Row borders** — `borderTop`/`borderBottom` go to all cells in the row; `borderLeft`/`borderRight` go to the first/last cell.
3. **Cell borders** take highest priority.
4. Adjacent cell borders are **collapsed** so each shared edge is stored once (the top/left cell owns it).

The normalization runs as a ProseMirror plugin after every transaction — no manual steps needed.

## Pagination Features

When used with `tiptap-pagination-plus`:

- **Automatic row grouping** based on `rowspan` attributes — related rows stay together across page breaks
- **Interactive column resizing** with drag handles
- **CSS custom properties** (`--cell-percentage`) for layout control

## License

MIT — based on [tiptap-table-plus](https://github.com/RomikMakavana/tiptap-table-plus) by Romik Makavana.
