# tiptap-boost

Monorepo of Tiptap editor extensions published under the `@tiptap-boost` npm scope.
Each package in `packages/` is an independently publishable Tiptap extension.
`apps/` exists solely for UI/UX testing and integration of the packages.

**Repo:** https://github.com/bjafl/tiptap-boost
**Stack:** TypeScript · Tiptap v3 · pnpm workspaces · Turborepo · Vitest

---

## Repository layout

```
packages/                          # Publishable Tiptap extensions (main focus)
  pdf/                             # @tiptap-boost/pdf
  tiptap-pagination-plus-plus/     # @tiptap-boost/tiptap-pagination-plus-plus
  tiptap-table-plus-plus/          # @tiptap-boost/tiptap-table-plus-plus
apps/
  dev-test-app/                    # Vite + React 19 sandbox for manual testing
tsconfig.base.json                 # Shared TS compiler options (extended by all packages)
turbo.json                         # Turborepo pipeline
pnpm-workspace.yaml                # Workspace roots: packages/*, apps/*
```

---

## Packages

### `@tiptap-boost/pdf`
Tiptap node extension for embedding PDFs, with an optional React viewer component.

- **Entries:** `@tiptap-boost/pdf` (core extension) · `@tiptap-boost/pdf/react` (React viewer)
- **Build:** Vite (`vite build --mode lib`) — outputs ES + CJS
- **Peer deps:** `@tiptap/core >=2`, `@tiptap/react >=2`, `react >=18`

### `@tiptap-boost/tiptap-table-plus-plus`
Tiptap table extension based on `tiptap-table-plus`, with border/styling support, column/row duplication, and pagination-aware table layout.

- **Entry:** `@tiptap-boost/tiptap-table-plus-plus`
- **Build:** `tsc` — outputs ESM only
- **Peer deps:** `@tiptap/core ^3.20`, `@tiptap/extension-table*`, `@tiptap/pm ^3.20`
- **Exports:** `TablePlus`, `TableRowPlus`, `TableCellPlus`, `TableHeaderPlus`, `WithoutPagination`

### `@tiptap-boost/tiptap-pagination-plus-plus`
Tiptap extension for page-break-aware document rendering (pages, headers, footers).

- **Entry:** `@tiptap-boost/tiptap-pagination-plus-plus`
- **Build:** `tsc` — outputs ESM only
- **Peer deps:** `@tiptap/core ^2||^3`, `@tiptap/pm ^2||^3`
- **Exports:** `PaginationPlus`, `PaginationPlusOptions`, `PAGE_SIZES`, `PageSize`

---

## Common commands

```bash
pnpm dev                                    # Start dev-test-app (via Turborepo)
pnpm build                                  # Build all packages
pnpm test                                   # Run all tests
pnpm test:coverage                          # Run tests with coverage
pnpm --filter @tiptap-boost/<name> build    # Build a single package
pnpm --filter @tiptap-boost/<name> test     # Test a single package
pnpm --filter @tiptap-boost/<name> watch    # Watch-build a single package
```

---

## Build system

Each package builds independently. Two patterns in use:

- **`tsc` only** (`tiptap-table-plus-plus`, `tiptap-pagination-plus-plus`): `tsconfig.json` with `outDir: dist`, `composite: true`. ESM only.
- **Vite** (`pdf`): own `vite.config.ts` + `tsconfig.build.json` for `vite-plugin-dts`. Outputs ES + CJS, supports multiple entry points.

All packages extend `tsconfig.base.json` (target: `es2022`, `moduleResolution: bundler`, strict).

### Turborepo pipeline (`turbo.json`)

- `build` — depends on upstream `^build`, outputs `dist/**`
- `test` / `test:coverage` — depend on `^build`, run Vitest
- `dev` / `watch` — persistent, no cache
- `clean` — runs `rimraf dist` per package

---

## Commit message format

Conventional Commits scoped to the short package name (strip the `@tiptap-boost/` prefix):

```
<type>(<scope>): <description>
```

**Types:** `feat` · `fix` · `chore` · `refactor` · `test` · `docs` · `build` · `ci`

**Scopes:**
| Scope | Package / area |
|---|---|
| `pdf` | `@tiptap-boost/pdf` |
| `tiptap-table-plus-plus` | `@tiptap-boost/tiptap-table-plus-plus` |
| `tiptap-pagination-plus-plus` | `@tiptap-boost/tiptap-pagination-plus-plus` |
| `dev-test-app` | `apps/dev-test-app` |
| `repo` | Root-level / monorepo config |

**Examples:**
```
feat(tiptap-table-plus-plus): add column resize handle
fix(tiptap-pagination-plus-plus): correct page-break calculation for nested nodes
chore(pdf): update vite-plugin-dts to v4
build(repo): add packageManager field to root package.json
```
