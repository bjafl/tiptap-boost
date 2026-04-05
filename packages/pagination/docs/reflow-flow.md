# Transaction & Reflow Flow

## Initialization

1. `state.init` — `PageMap.rebuild()` estimates page boundaries from node text length (no DOM). `buildDecorations()` runs with estimated heights → spacers are wrong but widgets exist.
2. `view()` — waits for `document.fonts.ready`, then dispatches a `META.init` transaction.
3. `state.apply(META.init)` — rebuilds PageMap again (same estimate), marks all pages dirty, rebuilds decorations.
4. `view.update` sees dirty pages → schedules RAF.

---

## Every RAF Pass (`runReflow`)

### Step 1 — Measure & cache heights
`measureAndCacheHeights`: walks dirty pages, calls `view.nodeDOM(pos).getBoundingClientRect().height` for each block, stores in `HeightCache` keyed by `type:fontSize:lineHeight:contentSize`.

### Step 2 — Overflow loop
For each dirty page index (in order):

- `detectOverflow`: walks nodes via `DomColumnHeight`, accumulates DOM heights with margin-collapse accounting. Returns the first node that doesn't fit + `remainingHeight` (column space before that node).
- **No overflow** → `tryPull`: re-accumulates current page height, peeks at first node of next page via `DomColumnHeight.peekChild`. Pulls nodes until page is full or next page is empty (removes empty pages). No doc mutation.
- **Overflow** → `handleOverflow`:
  - *Paragraph*: computes `pageBottom = el.top + remainingHeight`. Verifies `domOverflow > 0` (false-positive guard). Calls `TextSplitFinder.find` to locate a line-break point. On success: `ptx.splitParagraphAt` (one `tr.split` + two `tr.setNodeMarkup`) + `pageMap.setSplitBoundary/insertPageAfter`. Returns `'split'`. On failure (no split point or no DOM): `ptx.moveToNextPage` (PageMap only, no doc step). Returns `true`.
  - *Table*: same DOM check, `TableSplitAnalyzer.analyze`, falls back to `moveToNextPage`. Returns `true`.
  - *Default*: DOM false-positive check, then `moveToNextPage`. Returns `true`.
- If `'split'` returned: sets `docSplitDone = true`, breaks the loop immediately.
- If `true` returned: pushes `pageIndex + 1` onto the remaining queue.

### Step 3 — Fusion (only if no doc split this pass)
`fuseIfNeeded`: `splitRegistry.syncPageIndexes(pageMap)` then `findFusionCandidates()` (head+tail on same page). Calls `ptx.fuseNodes` (one `tr.join` + optional `tr.setNodeMarkup` to clear attrs).

### Step 4 — Measure page heights
`measurePageHeights`: for every page, walks nodes via `DomColumnHeight` using DOM elements → `Map<pageIndex, contentHeight>`. Used by `buildDecorations` to set spacer heights.

### Step 5 — Cleanup & return
- *Doc split done*: leave `pageMap` dirty, reset `lastReflowTime = 0` (bypass debounce next pass).
- *Fuse changed doc*: `pageMap.applyMapping(ptx.tr.mapping)` to shift positions post-join, leave dirty, reset debounce.
- *Neither*: `pageMap.applyMapping(ptx.tr.mapping)` (no-op for pure PageMap passes), `pageMap.clearDirty()`.
- Returns `{ correctionTr, pageHeights }`.

---

## Dispatch path (`view.update` → after RAF)

```
correctionTr (or fresh tr)
  .setMeta(META.pages, pageMap)
  .setMeta(META.correction, pageHeights)
→ view.dispatch(tr)
```

**`state.apply(META.pages)`**:
- Reads `newPageMap` and `heightsCorrection` from meta.
- Calls `buildDecorations(doc, newPageMap, geometry, options, heightsCorrection)` — this time with real DOM heights, so spacers are accurate.
- Returns new plugin state with updated decorations.

**`state.apply` for any `docChanged` transaction** (triggered by `correctionTr` if it has a split/join):
- `markDirtyFromTransaction` → `applyMapping` → `snapBoundaries` (fixes mid-node boundaries) → `splitRegistry.applyMapping`.
- If `snapped`: rebuilds decorations; otherwise maps existing `DecorationSet`.

**`view.update` after dispatch**:
- If dirty pages remain (split or fuse path left them): schedules another RAF → next pass continues.
- If no dirty pages: no RAF scheduled → stable.

---

## Convergence

Each pass handles at most **one `tr.split`** (doc split breaks the loop). Pure PageMap moves and pulls can batch freely. Fusion runs at most once per pass (after the loop). Typically converges in **N+1 passes** where N = number of paragraphs that need splitting.
