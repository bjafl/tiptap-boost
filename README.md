# tiptap-boost

A collection of Tiptap editor extensions published under the `@tiptap-boost` npm scope.

## Packages

| Package | Description |
|---|---|
| [`@tiptap-boost/tiptap-table-plus-plus`](packages/tiptap-table-plus-plus) | Table extension with per-side borders, styling attributes, and pagination support |
| [`@tiptap-boost/tiptap-pagination-plus-plus`](packages/tiptap-pagination-plus-plus) | Pagination extension with automatic page breaks and customizable headers/footers |
| [`@tiptap-boost/pdf`](packages/pdf) | PDF embed node extension with optional React viewer |

## Development

Requires [pnpm](https://pnpm.io).

```bash
pnpm install        # install all dependencies
pnpm dev            # start the dev/test app
pnpm build          # build all packages
pnpm test           # run all tests
```

To work on a single package:

```bash
pnpm --filter @tiptap-boost/<name> build
pnpm --filter @tiptap-boost/<name> watch
pnpm --filter @tiptap-boost/<name> test
```

## License

MIT
