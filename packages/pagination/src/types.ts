import type { CSSLengthValue } from './utils/CSSLength'

export type { CSSLengthValue }

// ── Header / footer content ──────────────────────────────────────────────────

/**
 * Content for one column slot in a header or footer.
 * - `string`: static HTML string rendered as innerHTML.
 * - function: called per widget with the page index (1-based) and total pages.
 * - `null` / omitted: column is empty.
 */
export type HeaderFooterSlot =
  | string
  | ((pageIndex: number, totalPages: number) => string)
  | null

/**
 * Three-column header or footer content.
 * Each column stretches equally and aligns its text: left | center | right.
 * If a column is omitted the others still share the available width.
 */
export interface HeaderFooterContent {
  left?: HeaderFooterSlot
  center?: HeaderFooterSlot
  right?: HeaderFooterSlot
}

// ── Page size ────────────────────────────────────────────────────────────────

export type PageSizePreset = 'A4' | 'Letter' | 'Legal'

export type PageSize =
  | PageSizePreset
  | { width: CSSLengthValue; height: CSSLengthValue }

// ── Margins ──────────────────────────────────────────────────────────────────

export type PageMargins = {
  top: CSSLengthValue
  right: CSSLengthValue
  bottom: CSSLengthValue
  left: CSSLengthValue
}

// ── Extension options (public API) ───────────────────────────────────────────

export interface PaginationOptions {
  /** Page size preset or explicit dimensions. Default: 'A4'. */
  pageSize: PageSize
  /** Page orientation. Default: 'portrait'. */
  orientation: 'portrait' | 'landscape'
  /** Page margins. Default: 25mm on all sides. */
  margins: PageMargins

  /** Minimum lines at the bottom of a page (orphan control). Default: 2. */
  orphanLines: number
  /** Minimum lines at the top of a new page (widow control). Default: 2. */
  widowLines: number

  /** Allow splitting paragraphs across pages. Default: true. */
  splitParagraphs: boolean
  /** Allow splitting tables on row boundaries. Default: true. */
  splitTables: boolean
  /** Allow splitting lists on item boundaries. Default: true. */
  splitLists: boolean

  /** Debounce delay (ms) before DOM-based reflow. Default: 150. */
  debounceMs: number
  /** Safety limit on reflow iterations. Default: 50. */
  maxIterations: number

  /** Visual gap between pages in px. Default: 40. */
  pageGap: number
  /**
   * Extra height (beyond page top margin) reserved for the header area.
   * When 0 the header container fits within the top margin. Default: 0.
   */
  headerHeight: number
  /**
   * Extra height (beyond page bottom margin) reserved for the footer area.
   * When 0 the footer container fits within the bottom margin. Default: 0.
   */
  footerHeight: number

  /** Content rendered in every page header. Default: null (no header content). */
  header: HeaderFooterContent | null
  /** Content rendered in every page footer. Default: null (no footer content). */
  footer: HeaderFooterContent | null

  /**
   * Padding between the page top edge and the header content.
   * Applied as `padding-top` on the header container.
   * Default: '0' (the page margin already provides spacing via min-height).
   */
  headerMarginOuter: CSSLengthValue
  /**
   * Padding between the header content and the page content area.
   * Applied as `padding-bottom` on the header container. Default: '0'.
   */
  headerMarginInner: CSSLengthValue
  /**
   * Padding between the page content area and the footer content.
   * Applied as `padding-top` on the footer container. Default: '0'.
   */
  footerMarginInner: CSSLengthValue
  /**
   * Padding between the footer content and the page bottom edge.
   * Applied as `padding-bottom` on the footer container. Default: '0'.
   */
  footerMarginOuter: CSSLengthValue

  /** CSS class prefix used for vars and class names. Default: 'tb-page'. */
  cssClassPrefix: string
}

// ── Runtime storage (px values, set during onCreate) ────────────────────────

export interface PaginationStorage {
  /** Resolved page width in px. */
  pageWidthPx: number
  /** Resolved page height in px. */
  pageHeightPx: number
  /** Resolved margins in px. */
  marginsPx: { top: number; right: number; bottom: number; left: number }
  /** Resolved content area dimensions in px. */
  contentWidthPx: number
  contentHeightPx: number
  /** Total number of pages (updated by plugin). */
  pageCount: number
}

// ── PageMap types ─────────────────────────────────────────────────────────────

export interface PageEntry {
  pageIndex: number
  /** Inclusive start position in the PM document. */
  startPos: number
  /** Exclusive end position in the PM document. */
  endPos: number
}

// ── Split tracking ────────────────────────────────────────────────────────────

export type SplitPart = 'head' | 'mid' | 'tail'

export interface SplitEntry {
  splitId: string
  splitPart: SplitPart
  pos: number
  pageIndex: number
}

// ── Height cache ──────────────────────────────────────────────────────────────

/** Cache key: `nodeTypeName:fontSize:lineHeight:contentSize` */
export type HeightCacheKey = string
export type HeightCache = Map<HeightCacheKey, number>
