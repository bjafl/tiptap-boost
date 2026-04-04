# Implementeringsplan: Pagineringsverktøy

Prioritert rekkefølge for utility-klasser, typer og hjelpefunksjoner
til `tiptap-pagination-plus-plus`.

---

## Fase 1 — Fundament

Disse klassene er grunnmuren. Alt annet avhenger av dem.

---

### 1.1 `PaginationConfig`

**Intensjon:** Sentralisert, typesikker konfigurasjon som injiseres i alle
andre klasser. Unngår magiske tall og gir brukeren kontroll over oppførsel.

```ts
type PageSizePreset = 'A4' | 'Letter' | 'Legal'
type PageSize = PageSizePreset | { width: number; height: number }

type PageMargins = {
  top: number
  right: number
  bottom: number
  left: number
}

interface PaginationConfig {
  // Sidedimensjoner
  pageSize: PageSize
  margins: PageMargins
  orientation: 'portrait' | 'landscape'

  // Typografi
  orphanLines: number        // min linjer på slutten av en side (default: 2)
  widowLines: number         // min linjer på starten av neste side (default: 2)

  // Splitting-oppførsel
  splitParagraphs: boolean   // tillat sub-paragraf splitting (default: true)
  splitTables: boolean       // tillat tabellsplitting på radgrense (default: true)
  splitLists: boolean        // tillat listesplitting (default: true)

  // Ytelse
  debounceMs: number         // ventetid før reflow ved typing (default: 150)
  maxIterations: number      // safety limit for korreksjonsrunder (default: 50)

  // Headers/footers
  headerHeight: number       // reservert plass for header (default: 0)
  footerHeight: number       // reservert plass for footer (default: 0)
}
```

**Implementeringsnotater:**
- Factory-funksjon `createDefaultConfig(overrides?)` med fornuftige defaults
- Preset-oppslag for standard sidestørrelser (A4 = 210×297mm, etc.)
- Alle mål i mm, konverteres til px internt via en `mmToPx()`-hjelper
  basert på 96 DPI eller konfigurerbar faktor

---

### 1.2 `PageGeometry`

**Intensjon:** Beregner den faktiske tilgjengelige innholdshøyden og -bredden
for en gitt side, basert på `PaginationConfig`. Separert fordi ulike sider
kan ha ulik geometri (første side med annen margin, liggende sider, etc.).

```ts
class PageGeometry {
  constructor(config: PaginationConfig, pageIndex?: number)

  /** Totale sidedimensjoner i px. */
  readonly pageWidth: number
  readonly pageHeight: number

  /** Tilgjengelig areal for innhold (etter margins og header/footer). */
  readonly contentWidth: number
  readonly contentHeight: number

  /** Individuelle marginer i px. */
  readonly margins: { top: number; right: number; bottom: number; left: number }

  /** Reservert plass for header/footer i px. */
  readonly headerHeight: number
  readonly footerHeight: number

  /**
   * Oppdater for en spesifikk side (f.eks. første side
   * med annerledes margin eller en liggende side).
   */
  withOverrides(overrides: Partial<PaginationConfig>): PageGeometry
}
```

**Implementeringsnotater:**
- Immutable — `withOverrides` returnerer ny instans
- `contentHeight = pageHeight - margins.top - margins.bottom - headerHeight - footerHeight`
- `contentWidth = pageWidth - margins.left - margins.right`
- Brukes av `DomColumnHeight` som `maxContentHeight`
- Brukes av NodeView for å sette CSS-variabler på page-containere

---

### 1.3 `PageMap`

**Intensjon:** Holder styr på hvilke PM-posisjoner som tilhører hvilken side.
Kjernedata-strukturen for virtuell paginering. Tilbyr oppslag, mutasjon,
dirty-tracking og posisjonsmapping etter transaksjoner.

```ts
interface PageEntry {
  pageIndex: number
  startPos: number  // inklusiv
  endPos: number    // eksklusiv
}

class PageMap {
  constructor()

  /** Antall sider. */
  readonly length: number

  /** Hent side-info for en gitt sideindeks. */
  getPage(pageIndex: number): PageEntry | null

  /** Finn hvilken side en PM-posisjon tilhører. */
  pageForPos(pos: number): PageEntry | null

  /** Finn sideindeks for en PM-posisjon. */
  pageIndexForPos(pos: number): number

  /** Hent alle sider. */
  allPages(): readonly PageEntry[]

  // ── Mutasjon ──

  /** Sett grense mellom to sider. */
  setSplitBoundary(pageIndex: number, newEndPos: number): void

  /** Sett inn ny side etter angitt indeks. */
  insertPageAfter(afterIndex: number, startPos: number, endPos: number): void

  /** Fjern en tom side. */
  removePage(pageIndex: number): void

  /**
   * Map alle posisjoner gjennom en PM transaction mapping.
   * Kalles etter hver transaksjon for å holde posisjoner synkronisert.
   */
  applyMapping(mapping: Mapping): void

  /**
   * Fullstendig rekonstruksjon fra et dokument.
   * Brukes ved initialisering og som fallback.
   */
  rebuild(doc: Node, geometry: PageGeometry): void

  // ── Dirty-tracking ──

  /** Merk en side som dirty (trenger reflow). */
  markDirty(pageIndex: number): void

  /** Merk sider som berørt av en transaksjon. */
  markDirtyFromTransaction(tr: Transaction): void

  /** Sjekk om en side er dirty. */
  isDirty(pageIndex: number): boolean

  /** Hent alle dirty sider. */
  dirtyPages(): number[]

  /** Nullstill dirty-flagg (etter reflow). */
  clearDirty(): void
}
```

**Implementeringsnotater:**
- Internt array av `PageEntry` sortert på `startPos`
- `pageForPos` bruker binærsøk for O(log n) oppslag
- `applyMapping` itererer og mapper `startPos`/`endPos` gjennom `mapping.map()`
- `markDirtyFromTransaction` bruker step-ranges for å finne berørte sider
  (samme logikk som `markDirtyPages`-funksjonen i strategidokumentet)
- `rebuild` traverserer dokumentet med `DomColumnHeight` for full rekonstruksjon

---

## Fase 2 — Måling og splitting

Kjerneverktøyene for å finne og utføre splits.

---

### 2.1 `DomColumnHeight`

**Status:** Allerede implementert. Se `DomColumnHeight.ts`.

**Kobling:** Bruker `PageGeometry.contentHeight` som `maxContentHeight`.

---

### 2.2 `TextSplitFinder`

**Intensjon:** Isolerer all DOM-målelogikk for sub-paragraf splitting.
Tar inn et paragraf-element og en Y-grense, returnerer nøyaktig
split-posisjon. Håndterer TreeWalker, binærsøk, ordgrense-justering,
og orphan/widow-kontroll. Testbar uavhengig av PM-transaksjoner.

```ts
interface TextSplitResult {
  /** DOM Text-node der splitten skjer. */
  textNode: Text
  /** Tegnoffset i tekstnoden. */
  offset: number
  /** Justert til ordgrense? */
  adjustedToWordBoundary: boolean
  /** Estimert antall linjer i head-delen. */
  headLines: number
  /** Estimert antall linjer i tail-delen. */
  tailLines: number
}

class TextSplitFinder {
  constructor(config: Pick<PaginationConfig, 'orphanLines' | 'widowLines'>)

  /**
   * Finn optimal split-posisjon i en paragraf.
   *
   * @param paragraphEl  DOM-elementet for paragrafen
   * @param maxY         Absolutt Y-koordinat der siden slutter
   * @returns            Split-resultat, eller null hvis paragrafen
   *                     bør flyttes hel (for lite plass, orphan/widow)
   */
  find(paragraphEl: HTMLElement, maxY: number): TextSplitResult | null

  /**
   * Map et TextSplitResult til en PM-posisjon.
   * Separert slik at find() kan brukes uten EditorView (testing).
   */
  toPmPos(result: TextSplitResult, view: EditorView): number
}
```

**Implementeringsnotater:**
- `find()` inneholder TreeWalker + binærsøk-logikken fra strategidokumentet
- Orphan-sjekk: returnerer `null` hvis `headLines < config.orphanLines`
- Widow-sjekk: hvis `tailLines < config.widowLines` og `headLines` tillater det,
  justerer maxY oppover med `(config.widowLines - tailLines) * lineHeight`
  og kjører binærsøket på nytt
- Linjehøyde leses fra `getComputedStyle(paragraphEl).lineHeight`
- `toPmPos` wrappet `view.posAtDOM(result.textNode, result.offset)`
- Ren DOM-logikk i `find()` — kan enhetstestes med en jsdom eller
  Playwright-fixture uten PM

---

### 2.3 `ReflowController`

**Intensjon:** Orkestratoren som binder alt sammen. Eier hele reflow-syklusen
fra overflow-deteksjon til konvergens. Holder state mellom view-updates
og kapsler inn debounce, dirty-tracking og safety limits.

```ts
class ReflowController {
  constructor(
    config: PaginationConfig,
    pageMap: PageMap,
    geometry: PageGeometry,
  )

  /**
   * Hoved-entry point. Kalles fra view.update() eller NodeView.update().
   * Returnerer en transaksjon hvis reflow var nødvendig, ellers null.
   */
  onViewUpdate(view: EditorView, prevState: EditorState): Transaction | null

  /**
   * Tvungen full reflow (f.eks. ved vindu-resize eller config-endring).
   */
  forceReflow(view: EditorView): Transaction | null

  /**
   * Håndterer paste-event med batch-splitting.
   */
  onPaste(view: EditorView, tr: Transaction): Transaction

  // ── Intern flyt (private, men dokumentert for oversikt) ──

  /** Debounce-guard: returnerer false hvis vi venter. */
  // private shouldReflow(): boolean

  /** Finn overflowende side og bestem split-strategi. */
  // private planSplit(view, pageIndex): SplitPlan

  /** Utfør split basert på plan. */
  // private executeSplit(view, plan): Transaction

  /** Kjør pull/push-korreksjon for en side. */
  // private correctPage(view, pageIndex): 'overflow' | 'underflow' | 'ok'

  /** Sjekk og utfør fusjoneringer. */
  // private fuseIfNeeded(view, tr): Transaction

  /** Konvergens-løkke: gjenta til stabil eller maks iterasjoner. */
  // private converge(view): Transaction | null
}
```

**Implementeringsnotater:**
- Eier `DomColumnHeight`-instanser (gjenbrukes med `reset()`)
- Eier `TextSplitFinder`-instans
- Bruker `PageMap.dirtyPages()` for å vite hva som trenger arbeid
- Debounce via intern timer — `onViewUpdate` returnerer `null`
  hvis siste kall var < `config.debounceMs` siden
- `onPaste` bypass-er debounce og kjører batch-splitting
- Alle transaksjoner merkes med `addToHistory: false`
- `converge` kjører en while-løkke med safety counter:
  detect → split/fuse → correct → repeat
- Emitter events/callbacks for UI-oppdatering (sidetall endret, etc.)

---

## Fase 3 — Split-sporing og transaksjoner

Verktøy for å holde styr på splittede noder og bygge transaksjoner ergonomisk.

---

### 3.1 `SplitRegistry`

**Intensjon:** Inkrementell indeks over alle splittede noder i dokumentet.
Unngår `doc.descendants`-traversering for å finne fusjons-kandidater.
Oppdateres via transaction-stepping.

```ts
interface SplitEntry {
  splitId: string
  splitPart: 'head' | 'mid' | 'tail'
  pos: number
  pageIndex: number
}

class SplitRegistry {
  constructor()

  /** Registrer en ny split. */
  register(entry: SplitEntry): void

  /** Fjern en split (etter fusjonering). */
  unregister(splitId: string, pos: number): void

  /** Hent alle deler av en gitt splitId. */
  getParts(splitId: string): SplitEntry[]

  /** Finn alle par som er på samme side (fusjons-kandidater). */
  findFusionCandidates(): Array<{ head: SplitEntry; tail: SplitEntry }>

  /** Oppdater alle posisjoner gjennom en transaction mapping. */
  applyMapping(mapping: Mapping): void

  /**
   * Oppdater sideindekser fra PageMap.
   * Kalles etter at PageMap er oppdatert.
   */
  syncPageIndexes(pageMap: PageMap): void

  /** Fullstendig rekonstruksjon fra et dokument. Fallback. */
  rebuild(doc: Node, pageMap: PageMap): void

  /** Antall aktive splits. */
  readonly size: number
}
```

**Implementeringsnotater:**
- Internt `Map<string, SplitEntry[]>` indeksert på `splitId`
- `findFusionCandidates` itererer kun over registrerte entries,
  ikke hele dokumentet
- `applyMapping` mapper alle `pos`-verdier — billig operasjon
- `syncPageIndexes` oppdaterer `pageIndex` fra `PageMap.pageForPos()`
- `rebuild` som fallback ved desync — traverserer `doc.descendants`
  og registrerer alle noder med `splitId`-attr

---

### 3.2 `PaginationTransaction`

**Intensjon:** Builder-wrapper rundt PM `Transaction` som forenkler
vanlige pagineringsoperasjoner. Eliminerer boilerplate rundt
split + merk + history-flagg.

```ts
class PaginationTransaction {
  constructor(tr: Transaction, registry: SplitRegistry)

  /** Tilgang til underliggende PM-transaksjon. */
  readonly tr: Transaction

  /**
   * Splitt en paragraf på en PM-posisjon og merk begge deler.
   * Genererer splitId automatisk.
   * Returnerer { headPos, tailPos, splitId }.
   */
  splitParagraphAt(
    pos: number,
    nodeAttrs: Attrs,
  ): { headPos: number; tailPos: number; splitId: string }

  /**
   * Fuse to deler av en splittet node.
   * Fjerner splitId/splitPart hvis ingen flere deler gjenstår.
   */
  fuseNodes(headPos: number, tailPos: number): void

  /**
   * Promoter en tail til mid (ved videre splitting).
   */
  promoteToMid(pos: number): void

  /**
   * Flytt en blokk-node fra en side til neste.
   * Oppdaterer PageMap boundary.
   */
  moveToNextPage(nodePos: number, pageMap: PageMap): void

  /**
   * Pull første node fra neste side til denne.
   * Oppdaterer PageMap boundary.
   */
  pullFromNextPage(pageIndex: number, pageMap: PageMap): void

  /**
   * Fullfør og returner transaksjonen.
   * Setter addToHistory: false automatisk.
   */
  finalize(): Transaction
}
```

**Implementeringsnotater:**
- Alle metoder muterer `this.tr` og oppdaterer `SplitRegistry`
- `splitParagraphAt` gjør `tr.split()` + `tr.setNodeMarkup()` × 2
  + `registry.register()` × 2 i ett kall
- `fuseNodes` gjør `tr.join()` + `registry.unregister()`
  + conditional cleanup av attrs
- `finalize()` setter `addToHistory: false` og returnerer `tr`
- Kan kjedes: `ptx.splitParagraphAt(...).promoteToMid(...).finalize()`

---

## Fase 4 — Spesialisert splitting

Verktøy for spesifikke nodetyper med kompleks splitting-logikk.

---

### 4.1 `TableSplitAnalyzer`

**Intensjon:** Wrapper rundt `TableMap` som analyserer en tabell og
finner trygge split-punkter med hensyn til rowspan og nøstede tabeller.

```ts
interface TableSplitPlan {
  /** Radindeks å splitte FØR (0-basert). null = flytt hele tabellen. */
  splitBeforeRow: number | null
  /** Rader som er blokkert av rowspan. */
  unsafeRows: Set<number>
  /** Alle trygge rader som kunne vært split-punkt. */
  safeRows: number[]
  /** Akkumulert høyde per rad. */
  rowHeights: number[]
}

class TableSplitAnalyzer {
  constructor()

  /**
   * Analyser en tabell og finn optimalt split-punkt.
   *
   * @param tableNode      PM table-node
   * @param tableDOM       Rendret tabell-element
   * @param remainingHeight  Tilgjengelig plass på nåværende side
   * @returns              Plan for splitting, eller null hvis tabellen passer
   */
  analyze(
    tableNode: Node,
    tableDOM: HTMLElement,
    remainingHeight: number,
  ): TableSplitPlan | null

  /**
   * Sjekk om en spesifikk rad er trygg å splitte på.
   */
  isRowSafe(tableNode: Node, rowIndex: number): boolean
}
```

**Implementeringsnotater:**
- Bruker `TableMap.get(tableNode)` for å finne celle-rects
- Bygger `unsafeRows` ved å iterere alle celler og finne
  de med `rect.bottom > rect.top + 1`
- `safeRows` = alle rader som ikke er i `unsafeRows` og ikke er rad 0
- Radhøyder måles via `querySelectorAll('tr')` + `getBoundingClientRect()`
- For nøstede tabeller: radhøyden inkluderer allerede nøstede tabeller
  via DOM-måling — ingen spesiallogikk nødvendig
- `splitBeforeRow` er den siste trygge raden der
  akkumulert høyde ≤ remainingHeight

---

## Avhengighetsgraf

```
PaginationConfig
 │
 ├─► PageGeometry
 │    │
 │    ├─► DomColumnHeight (bruker contentHeight)
 │    │
 │    └─► PageMap (bruker geometry i rebuild)
 │         │
 │         ├─► SplitRegistry (bruker pageForPos)
 │         │
 │         └─► ReflowController
 │              │
 │              ├─► DomColumnHeight
 │              ├─► TextSplitFinder
 │              ├─► TableSplitAnalyzer
 │              ├─► SplitRegistry
 │              └─► PaginationTransaction
 │                   │
 │                   └─► SplitRegistry
 │
 └─► TextSplitFinder (bruker orphan/widow config)
```

---

## Implementeringsrekkefølge

| Steg | Klasse                  | Avhenger av                      | Estimat |
| ---- | ----------------------- | -------------------------------- | ------- |
| 1    | `PaginationConfig`      | —                                | Liten   |
| 2    | `PageGeometry`          | Config                           | Liten   |
| 3    | `PageMap`               | Geometry                         | Medium  |
| 4    | `DomColumnHeight`       | Geometry (allerede implementert) | Ferdig  |
| 5    | `TextSplitFinder`       | Config                           | Medium  |
| 6    | `SplitRegistry`         | PageMap                          | Medium  |
| 7    | `PaginationTransaction` | SplitRegistry                    | Medium  |
| 8    | `TableSplitAnalyzer`    | —                                | Medium  |
| 9    | `ReflowController`      | Alt over                         | Stor    |

Steg 1–4 kan gjøres raskt og gir en testbar grunnmur.
Steg 5–8 kan utvikles parallelt.
Steg 9 er integrasjonsarbeidet som binder alt sammen.

---

## Testbarhet

Hver klasse er designet for isolert testing:

- **Config, Geometry, PageMap, SplitRegistry**: Ren logikk, ingen DOM —
  standard Vitest unit tests
- **DomColumnHeight, TextSplitFinder, TableSplitAnalyzer**: DOM-avhengig —
  Playwright e2e med test-harness, eller Vitest med happy-dom for enklere cases
- **PaginationTransaction**: Trenger PM EditorState — Vitest med
  `prosemirror-test-builder`
- **ReflowController**: Integrasjonstest — Playwright med full editor-fixture