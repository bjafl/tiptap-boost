# Implementation Plan — `@tiptap-boost/pagination`

## Status overview

| File | Status |
|---|---|
| `src/utils/DomColumnHeight.ts` | ✅ Done |
| `src/utils/CSSLength.ts` | ✅ Done |
| `src/utils/cssVars.ts` | ⚠️ Exists, but references old types — needs rewrite |
| `src/config.ts` | ⚠️ Stub only |
| `src/types.ts` | ⚠️ Empty |
| `src/Pagination.ts` | ⚠️ Stub only |
| `src/index.ts` | ⚠️ Broken imports |
| `src/styles/pagination.scss` | ⚠️ Empty |

---

## Governing documents

- [`pagination-strategy-md`](./pagination-strategy-md) — architecture, two-phase pipeline, decoration model
- [`pagination-utils-plan.md`](./pagination-utils-plan.md) — utility class specifications

Architecture: **flat PM doc + widget decorations**. No page-nodes, no NodeViews.
Two-phase pipeline: `appendTransaction` (sync, cache-based) → `view.update` (async, DOM-based).

---

## Open design questions

These need answers before or during implementation. See section below for alternatives.

### Q1 — Option type for dimensions

The utils plan uses `number` (in mm) internally, but user intent is that extension
options accept CSS length strings (`'21cm'`, `'1in'`, `'210mm'`).

**Decision needed:** Should `PaginationOptions` (Tiptap-facing) use `CSSLengthValue`
for all dimensional fields, with internal conversion to px via `CSSLength`?

**Proposed resolution:** Yes. `PaginationOptions` uses `CSSLengthValue` strings.
`PageGeometry` converts to px internally. This is consistent with `cssVars.ts`
and the `CSSLength` utility already in the package.

---

### Q2 — Underflow / pull correction without a page body element

The strategy's `correctPageFill` checks `bodyEl.scrollHeight > bodyEl.clientHeight`,
implying a real `<div class="page-body">` DOM element. In the flat/decoration model,
no such element exists — the "page body" is a virtual range of PM nodes.

**Decision needed:** How is overflow/underflow detected in the flat model?

**Proposed resolution:**
- **Overflow**: re-run `DomColumnHeight` accumulation over nodes in `page.startPos..endPos`.
  If accumulated height > `geometry.contentHeight` → overflow.
- **Underflow (pull)**: after measuring current page fits, check whether the first node
  on the next page would also fit. If `col.remaining >= firstNextNodeHeight` → pull it.
- No `scrollHeight` / `clientHeight` comparison needed.

---

### Q3 — First-load initialisation with empty height cache

On first mount, the height cache is empty. `appendTransaction` fallback estimates
(line-count × 24px) will be wrong. Should the initial reflow be skipped in
`appendTransaction` and deferred entirely to `view.update`?

**Proposed resolution:** Yes. Add an `initialized: boolean` flag to plugin state.
- Before `fonts.ready` resolves → `initialized = false`, `appendTransaction` is a no-op.
- After first successful `view.update` reflow → `initialized = true`, both phases active.
- This matches the pattern in `tiptap-pagination-plus-plus`.

---

### Q4 — `addGlobalAttributes` for `splitId` / `splitPart`

Split node attrs need to be present on `paragraph`, `table`, `listItem`, etc.
Tiptap's `addGlobalAttributes()` in the extension is the correct hook.

**Decision needed:** Which node types get these attrs?

**Proposed resolution:** Register on all nodes that are direct children of `doc`
(i.e., block-level nodes). In practice: detect from `schema.topNodeType.contentMatch`
or hardcode a list with an override option.

---

## Phased roadmap

### Phase 1 — Config & geometry (foundation)

**Goal:** Establish the configuration contract. No logic that isn't tested yet.

- [ ] **`src/types.ts`** — define all shared types:
  - `CSSLengthValue` re-export from `CSSLength`
  - `PageSizePreset = 'A4' | 'Letter' | 'Legal'`
  - `PageSize = PageSizePreset | { width: CSSLengthValue; height: CSSLengthValue }`
  - `PageMargins = { top: CSSLengthValue; right: CSSLengthValue; bottom: CSSLengthValue; left: CSSLengthValue }`
  - `PaginationOptions` (Tiptap extension options, CSS-string fields)
  - `PaginationStorage` (runtime storage, px values)
  - `PageEntry`, `SplitPart`, `SplitEntry` (used by PageMap/SplitRegistry)

- [ ] **`src/constants.ts`** — page size presets in mm, default config values, style prefix

- [ ] **`src/utils/PageGeometry.ts`** — class `PageGeometry`
  - Constructor accepts `PaginationOptions` + optional `pageIndex`
  - Converts all CSS lengths to px via `CSSLength.parse().toPx()`
  - Exposes: `pageWidth`, `pageHeight`, `contentWidth`, `contentHeight`, `margins`, `headerHeight`, `footerHeight`
  - `withOverrides(overrides)` → new `PageGeometry`
  - Unit tests: verify A4 dimensions, margin subtraction, header/footer subtraction

- [ ] **`src/utils/cssVars.ts`** — rewrite to use `PaginationOptions` / `PageGeometry`
  - Remove old `PaginationPlusStorage` reference
  - Sync vars: `--page-width`, `--page-height`, `--page-margin-*`, `--page-content-height`, `--page-gap`, `--page-count`
  - Accept `PageGeometry` as source of truth (already-converted px values)

---

### Phase 2 — PageMap

**Goal:** Core data structure for virtual page boundaries.

- [ ] **`src/pm/PageMap.ts`** — class `PageMap`
  - Internal `PageEntry[]` sorted by `startPos`
  - `getPage(index)`, `pageForPos(pos)` (binary search), `pageIndexForPos(pos)`
  - `allPages()`, `length`
  - `setSplitBoundary(pageIndex, newEndPos)`, `insertPageAfter(...)`, `removePage(...)`
  - `applyMapping(mapping: Mapping)` — maps all positions through PM transaction
  - `rebuild(doc, geometry)` — full reconstruction using `DomColumnHeight` estimates
  - Dirty tracking: `markDirty(idx)`, `markDirtyFromTransaction(tr)`, `isDirty(idx)`, `dirtyPages()`, `clearDirty()`
  - Unit tests: boundary setting, position lookup, dirty tracking, mapping

---

### Phase 3 — Text & table split finders

**Goal:** DOM-based utilities to locate exact split positions.

- [ ] **`src/pm/TextSplitFinder.ts`** — class `TextSplitFinder`
  - Constructor: `config: Pick<PaginationConfig, 'orphanLines' | 'widowLines'>`
  - `find(paragraphEl, maxY)` → `TextSplitResult | null`
    - TreeWalker over text nodes
    - Binary search with `Range.getBoundingClientRect()`
    - Word-boundary adjustment
    - Orphan check (return `null` if not enough space for `orphanLines`)
    - Widow check (reduce `maxY` by lineHeight if tail too short)
  - `toPmPos(result, view)` → `number` (wraps `view.posAtDOM`)
  - Unit testable without PM (pure DOM logic in `find()`)

- [ ] **`src/pm/TableSplitAnalyzer.ts`** — class `TableSplitAnalyzer`
  - `analyze(tableNode, tableDOM, remainingHeight)` → `TableSplitPlan | null`
  - Builds `unsafeRows` set from `TableMap` rowspan data
  - Measures row heights via `querySelectorAll('tr') + getBoundingClientRect`
  - Returns `splitBeforeRow` = last safe row fitting within `remainingHeight`

---

### Phase 4 — Split registry & transaction builder

**Goal:** Bookkeeping for split node pairs and ergonomic transaction building.

- [ ] **`src/pm/SplitRegistry.ts`** — class `SplitRegistry`
  - Internal `Map<splitId, SplitEntry[]>`
  - `register`, `unregister`, `getParts`, `findFusionCandidates`
  - `applyMapping(mapping)`, `syncPageIndexes(pageMap)`, `rebuild(doc, pageMap)`
  - Unit tests: register/unregister, fusion candidate detection, mapping

- [ ] **`src/pm/PaginationTransaction.ts`** — class `PaginationTransaction`
  - Wraps PM `Transaction` + `SplitRegistry`
  - `splitParagraphAt(pos, attrs)` → `{ headPos, tailPos, splitId }`
  - `fuseNodes(headPos, tailPos)`
  - `promoteToMid(pos)`
  - `moveToNextPage(nodePos, pageMap)`, `pullFromNextPage(pageIndex, pageMap)`
  - `finalize()` → sets `addToHistory: false`, returns `Transaction`

---

### Phase 5 — Decorations & styles

**Goal:** Visual page rendering via widget decorations.

- [ ] **`src/pm/buildDecorations.ts`** — `buildDecorations(doc, pageMap, geometry, config)`
  - Creates one header widget at pos 0 (first page)
  - Creates one breaker widget after each `page.endPos`
  - Last breaker: footer only (no following header)
  - Spacer height = `geometry.contentHeight - accumulatedContentHeight`
  - Returns stable `DecorationSet`

- [ ] **`src/pm/breakerWidget.ts`** — `createBreakerWidget(pageIndex, spacerHeight, config)`
  - `page-breaker` container: spacer + footer + gap + header
  - `pointer-events: none` on container, `auto` on header/footer
  - Sets `--page-number` CSS var on the widget element
  - Header/footer: scaffolded structure, content via slots/config callbacks

- [ ] **`src/styles/pagination.scss`** — all visual styles
  - Page geometry via CSS vars on `.ProseMirror` (set by `cssVars.ts`)
  - `.page-breaker`, `.page-spacer`, `.page-gap`, `.page-header`, `.page-footer`
  - Split node CSS: `[data-split-part='head']`, `[data-split-part='tail']`, `[data-split-part='mid']`
  - CSS counter for page numbers

---

### Phase 6 — ReflowController

**Goal:** Orchestrate the full two-phase reflow cycle.

- [ ] **`src/pm/ReflowController.ts`** — class `ReflowController`
  - Constructor: `config, pageMap, geometry`
  - `onViewUpdate(view, prevState)` → `Transaction | null`
    - Debounce guard
    - Iterate `pageMap.dirtyPages()`
    - For each dirty page: detect overflow/underflow (via `DomColumnHeight`)
    - Overflow → plan split (paragraph / table / list / block-move)
    - Underflow → pull from next page
    - Build `PaginationTransaction`, execute, return
    - Fuse split nodes on same page
    - Update height cache
  - `forceReflow(view)` → `Transaction | null`
  - `onPaste(view, tr)` → `Transaction` (batch splits, bypass debounce)
  - Owns `DomColumnHeight`, `TextSplitFinder`, `TableSplitAnalyzer`, `SplitRegistry`, `PaginationTransaction` instances

---

### Phase 7 — PM Plugin

**Goal:** Wire everything into a ProseMirror plugin.

- [ ] **`src/pm/paginationPlugin.ts`** — `getPaginationPlugin(options)`
  - Plugin state: `{ pageMap, decorations, heightCache, initialized, splitRegistry }`
  - `state.init`: create empty `PageMap`, empty `DecorationSet`, schedule `INIT_META`
  - `state.apply`:
    - If `INIT_META`: build initial `PageMap` (cache-based), build decorations
    - If `PAGES_META` (from view.update): store new `pageMap` + decorations
    - If `docChanged` (user edit): `pageMap.applyMapping(tr.mapping)`, `pageMap.markDirtyFromTransaction(tr)`, remap decorations
    - Return updated state
  - `props.decorations`: return `state.decorations`
  - `view.init`: wait for `document.fonts.ready`, then dispatch `INIT_META`
  - `view.update`: if `!state.initialized || !dirty` → skip; else RAF guard → `reflowController.onViewUpdate()`
  - `appendTransaction`: if `!state.initialized` → skip; else run sync cache-based overflow estimation + block splits

---

### Phase 8 — Tiptap Extension

**Goal:** Public extension API, schema attrs, global attributes.

- [ ] **`src/Pagination.ts`** — `Extension.create<PaginationOptions, PaginationStorage>`
  - `addOptions()`: return `createDefaultOptions()` (A4, 25mm margins, etc.)
  - `addStorage()`: return initial storage (px-converted from options)
  - `addGlobalAttributes()`: add `splitId` (null) and `splitPart` (null) to all block node types
  - `onCreate()`: set CSS vars on editor element, create plugin with resolved geometry
  - `onDestroy()`: clear CSS vars, cleanup
  - `addProseMirrorPlugins()`: return `[getPaginationPlugin(resolvedOptions)]`
  - `addCommands()`: `setPageSize`, `setMargins`, `forceReflow` (optional)

- [ ] **`src/index.ts`** — clean up, export `Pagination`, `PAGE_SIZES`, types

---

### Phase 9 — Tests

- [ ] Unit tests for `PageGeometry`, `PageMap`, `SplitRegistry`, `PaginationTransaction`
- [ ] E2e tests (Playwright) for: overflow detection, paragraph split, table split, undo/redo, paste

---

## Implementation order

```
types.ts → constants.ts → PageGeometry → cssVars.ts (rewrite)
  → PageMap
    → TextSplitFinder + TableSplitAnalyzer (parallel)
      → SplitRegistry → PaginationTransaction
        → buildDecorations + breakerWidget
          → scss styles (parallel with decorations)
            → ReflowController
              → paginationPlugin.ts
                → Pagination.ts (extension shell)
                  → index.ts cleanup → tests
```

Phases 1–2 give a testable base. Phases 3–4 can overlap. Phase 6 is the
largest and integrates everything.

---

## Key invariants to preserve

1. **Decorations never built in `props.decorations()`** — always built in `state.apply()`, returned by reference. Prevents infinite render loops.
2. **All split/fuse transactions: `addToHistory: false`**.
3. **`appendTransaction` never accesses DOM** — cache-based only, or no-op if `!initialized`.
4. **`view.update` uses RAF guard** — prevents queuing multiple corrections between frames.
5. **Anti-oscillation**: `appliedSplitPositions` set (or equivalent) carried across `SPLIT_META` transactions; reset on external edits.
6. **`PageMap.applyMapping`** called on every docChanged transaction — positions never go stale.
