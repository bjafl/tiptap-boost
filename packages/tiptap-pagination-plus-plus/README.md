# @tiptap-boost/tiptap-pagination-plus-plus

Tiptap extension that adds page-break-aware pagination to the editor — automatic page breaks, customizable headers/footers, and predefined page sizes.

Based on [tiptap-pagination-plus](https://github.com/RomikMakavana/tiptap-pagination-plus) by Romik Makavana.

Supports Tiptap **v2** and **v3**.

## Installation

```bash
npm install @tiptap-boost/tiptap-pagination-plus-plus
```

### Peer dependencies

```bash
npm install @tiptap/core @tiptap/pm
```

## Usage

```typescript
import { Editor } from '@tiptap/core'
import { PaginationPlus, PAGE_SIZES } from '@tiptap-boost/tiptap-pagination-plus-plus'

const editor = new Editor({
  extensions: [
    PaginationPlus.configure({
      pageHeight: 1123,
      pageWidth: 794,
      marginTop: 95,
      marginBottom: 95,
      marginLeft: 76,
      marginRight: 76,
      headerLeft: '<strong>My Document</strong>',
      headerRight: 'Page {page}',
      footerLeft: '',
      footerRight: 'Page {page}',
    }),
  ],
})

// Use a predefined page size
editor.chain().focus().updatePageSize(PAGE_SIZES.A4).run()
```

## Exports

| Export | Description |
|---|---|
| `PaginationPlus` | The Tiptap extension |
| `PaginationPlusOptions` | Options interface |
| `PAGE_SIZES` | Object of predefined page sizes |
| `PageSize` | Page size type |

### Predefined page sizes (`PAGE_SIZES`)

| Key | Dimensions (px) |
|---|---|
| `A4` | 794 × 1123 |
| `A3` | 1123 × 1591 |
| `A5` | 419 × 794 |
| `LETTER` | 818 × 1060 |
| `LEGAL` | 818 × 1404 |
| `TABLOID` | 1060 × 1635 |

## License

MIT
