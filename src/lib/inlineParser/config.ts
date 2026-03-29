export const STYLE_PROP_DEFS = {
  border: { sides: true, parts: ['width', 'style', 'color'] as const },
  padding: { sides: true, parts: [] as const },
  margin: { sides: true, parts: [] as const },
  background: { sides: false, parts: ['color'] as const },
  height: { sides: false, parts: [] as const },
  width: { sides: false, parts: [] as const },
  textAlign: { sides: false, parts: [] as const },
  verticalAlign: { sides: false, parts: [] as const },
} as const;

export const MAX_CACHE_SIZE = 512;

// <line-style> keyword set (from CSS spec)
export const LINE_STYLE_KEYWORDS = new Set([
  'none',
  'hidden',
  'dotted',
  'dashed',
  'solid',
  'double',
  'groove',
  'ridge',
  'inset',
  'outset',
]);

// <line-width> keywords (from CSS spec)
export const LINE_WIDTH_KEYWORDS = new Set([
  'hairline',
  'thin',
  'medium',
  'thick',
]);

// <length>: optional sign, digits/decimals, optional unit  — or bare 0
// Also matches percentages (e.g. for relative lengths)
export const LENGTH_RE =
  /^[+-]?(\d+\.?\d*|\.\d+)(%|em|ex|cap|ch|ic|rem|lh|rlh|vw|vh|vi|vb|vmin|vmax|cm|mm|Q|in|pc|pt|px)?$/;
