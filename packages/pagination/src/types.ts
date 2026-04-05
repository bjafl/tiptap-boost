import type { CSSLengthValue } from './utils/CSSLength'

export type { CSSLengthValue }

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
  /** Reserved height for page headers in px. Default: 0. */
  headerHeight: number
  /** Reserved height for page footers in px. Default: 0. */
  footerHeight: number

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
