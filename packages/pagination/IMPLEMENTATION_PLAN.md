# Implementation Plan — `@tiptap-boost/pagination`

## Status overview

| File | Status |
|---|---|
| `src/utils/DomColumnHeight.ts` | ✅ Done |
| `src/utils/CSSLength.ts` | ✅ Done |
| `src/utils/PageGeometry.ts` | ✅ Done |
| `src/utils/cssVars.ts` | ✅ Done (rewritten) |
| `src/types.ts` | ✅ Done |
| `src/constants.ts` | ✅ Done |
| `src/pm/PageMap.ts` | ✅ Done |
| `src/pm/TextSplitFinder.ts` | ✅ Done |
| `src/pm/TableSplitAnalyzer.ts` | ✅ Done |
| `src/pm/SplitRegistry.ts` | ✅ Done |
| `src/pm/PaginationTransaction.ts` | ✅ Done |
| `src/pm/buildDecorations.ts` | ✅ Done |
| `src/pm/breakerWidget.ts` | ✅ Done |
| `src/pm/ReflowController.ts` | ✅ Done (known gaps, see below) |
| `src/pm/paginationPlugin.ts` | ✅ Done (Phase 1 sync path stubbed) |
| `src/Pagination.ts` | ✅ Done |
| `src/index.ts` | ✅ Done |
| `src/styles/pagination.scss` | ✅ Done |
| `src/utils/logger.ts` | ✅ Done |

---

## Governing documents

- [`pagination-strategy-md`](./pagination-strategy-md) — architecture, two-phase pipeline, decoration model
- [`pagination-utils-plan.md`](./pagination-utils-plan.md) — utility class specifications

Architecture: **flat PM doc + widget decorations**. No page-nodes, no NodeViews.
Two-phase pipeline: `appendTransaction` (sync, cache-based) → `view.update` (async, DOM-based).

---

## Resolved design decisions

| # | Question | Resolution |
|---|---|---|
| Q1 | Option types for dimensions | `PaginationOptions` uses `CSSLengthValue`; `PageGeometry` converts to px |
| Q2 | Overflow/underflow without page body element | Re-run `DomColumnHeight` over node range; no `scrollHeight` needed |
| Q3 | First-load init with empty height cache | Skip all reflow until `fonts.ready`; `initialized` flag in plugin state |
| Q4 | `addGlobalAttributes` node types | Hardcoded list: `paragraph`, `heading`, `bulletList`, `orderedList`, `listItem`, `table`, `blockquote`, `codeBlock` |

---

## Known gaps / pending work

### Functional gaps

1. **Table row splitting not implemented** — `ReflowController.handleOverflow` computes the `TableSplitPlan` but falls back to moving the whole table. The actual `tr.split()` on table rows still needs to be built.

2. **List splitting not implemented** — lists are treated as monolithic blocks; no item-boundary split logic.

3. **`appendTransaction` Phase 1 is a no-op** — `appendTransaction` runs but immediately returns `null` because it has no `EditorView` access. The strategy calls for sync cache-based block moves here; currently all splits are deferred to Phase 2 (`view.update`). Acceptable for now since Phase 2 handles it, but adds ~1 frame of visual delay.

4. **Page count CSS var not updated** — `updatePageCount` exists in `cssVars.ts` but is never called after reflow. `--tb-page-count` stays at 1.

5. **Dead code in `ReflowController.estimateOverflow`** — calls `getComputedStyle(document.documentElement)` as a placeholder (unreachable in practice). Should be removed when Phase 1 sync path is properly implemented.

6. **`PageGeometry.withOverrides` broken** — `_options` is `private` so `withOverrides` cannot read it; linter commented out `static create()`. The constructor must store options via a different pattern.

---

### Next priorities

| Priority | Task |
|---|---|
| P1 | Wire into dev-test-app for manual testing |
| P1 | Fix `PageGeometry.withOverrides` / `_options` storage |
| P1 | Update page count CSS var after reflow |
| P2 | Implement table row splitting in `ReflowController` |
| P2 | Implement `appendTransaction` Phase 1 sync path |
| P3 | List splitting |
| P3 | Phase 9 unit + e2e tests |

---

## Phase 9 — Tests (pending)

- [ ] Unit tests for `PageGeometry`, `PageMap`, `SplitRegistry`, `PaginationTransaction`
- [ ] E2e tests (Playwright) for: overflow detection, paragraph split, table split, undo/redo, paste

---

## Key invariants to preserve

1. **Decorations never built in `props.decorations()`** — always built in `state.apply()`, returned by reference. Prevents infinite render loops.
2. **All split/fuse transactions: `addToHistory: false`**.
3. **`appendTransaction` never accesses DOM** — cache-based only, or no-op if `!initialized`.
4. **`view.update` uses RAF guard** — prevents queuing multiple corrections between frames.
5. **Anti-oscillation**: `appliedSplitPositions` set (or equivalent) prevents re-splitting the same position in one cycle; reset on external edits.
6. **`PageMap.applyMapping`** called on every docChanged transaction — positions never go stale.
