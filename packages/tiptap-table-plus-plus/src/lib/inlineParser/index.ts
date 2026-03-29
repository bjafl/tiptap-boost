/**
 * inline-style-parser
 *
 * Parses inline CSS style strings into atomic key/value tuples.
 * Supports shorthand expansion for border, padding, margin, background.
 *
 * Design principles:
 * - STYLES config is the single source of truth – easy to extend
 * - All public output uses AtomicStyleKey (fully-qualified, no ambiguity)
 * - Input parsing is lenient (string); validation happens at expansion time
 * - No runtime dependencies
 */

// ── Types ────────────────────────────────────────────────────────────────
export type {
  StyleBase,
  StyleConfig,
  Side,
  Cap,
  StyleSide,
  StylePart,
  RelatedAtomicKey,
  AtomicKey,
  StyleKey,
  StyleTuple,
  RawTuple,
  SideValues,
  StyleQuery,
} from './types';
export { SIDES } from './types';

// ── Config ───────────────────────────────────────────────────────────────
export {
  STYLE_PROP_DEFS,
  LINE_STYLE_KEYWORDS,
  LINE_WIDTH_KEYWORDS,
  LENGTH_RE,
} from './config';

// ── Utilities ────────────────────────────────────────────────────────────
export {
  getAtomicKeySet,
  cap,
  kebabToCamel,
  camelToKebab,
  getBase,
  isAtomicKey,
  isLineStyle,
  isLineWidth,
} from './utils';

// ── Parsing ──────────────────────────────────────────────────────────────
export {
  parseDeclarations,
  parseBorderShorthand,
  parseSideShorthand,
} from './parse';

// ── Expansion ────────────────────────────────────────────────────────────
export { expand } from './expand';

// ── Serialization & public API ───────────────────────────────────────────
export {
  parseStyleString,
  parseElement,
  getStyle,
  getBaseStyles,
  mergeStyles,
  parseStyleMap,
} from './serialize';

// ── Cache ────────────────────────────────────────────────────────────────
export { StyleCache, STYLE_CACHE } from './cache';
