import type { PageSizePreset, PageMargins, PaginationOptions } from './types'

// ── Page size presets (in mm) ─────────────────────────────────────────────────

export const PAGE_SIZES: Record<PageSizePreset, { width: string; height: string }> = {
  A4: { width: '210mm', height: '297mm' },
  Letter: { width: '215.9mm', height: '279.4mm' },
  Legal: { width: '215.9mm', height: '355.6mm' },
}

// ── Default config ────────────────────────────────────────────────────────────

const DEFAULT_MARGINS: PageMargins = {
  top: '25mm',
  right: '25mm',
  bottom: '25mm',
  left: '25mm',
}

export const DEFAULT_OPTIONS: PaginationOptions = {
  pageSize: 'A4',
  orientation: 'portrait',
  margins: DEFAULT_MARGINS,
  orphanLines: 2,
  widowLines: 2,
  splitParagraphs: true,
  splitTables: true,
  splitLists: true,
  debounceMs: 150,
  maxIterations: 50,
  pageGap: 40,
  headerHeight: 0,
  footerHeight: 0,
  cssClassPrefix: 'tb-page',
}

// ── Style / class names ───────────────────────────────────────────────────────

export const DEFAULT_STYLE_PREFIX = 'tb-page'

export const CLASS = {
  breaker: 'tb-page-breaker',
  spacer: 'tb-page-spacer',
  gap: 'tb-page-gap',
  header: 'tb-page-header',
  footer: 'tb-page-footer',
} as const

// ── Plugin meta keys ──────────────────────────────────────────────────────────

export const META = {
  init: 'paginationInit',
  pages: 'paginationPages',
  split: 'paginationSplit',
  correction: 'paginationCorrection',
} as const
