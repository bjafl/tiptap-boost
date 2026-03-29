import { STYLE_CACHE } from './cache';
import { expand } from './expand';
import { parseDeclarations } from './parse';
import {
  StyleTuple,
  Side,
  SIDES,
  AtomicKey,
  StyleQuery,
  StyleBase,
  StyleKey,
} from './types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a raw CSS inline style string into fully-expanded atomic tuples.
 *
 * @example
 * parseStyleString('border: 1px solid red; padding: 4px 8px')
 * // → [
 * //   ['borderTopWidth', '1px'], ['borderTopStyle', 'solid'], ['borderTopColor', 'red'],
 * //   ... (all 12 border atomic keys)
 * //   ['paddingTop', '4px'], ['paddingRight', '8px'], ['paddingBottom', '4px'], ['paddingLeft', '8px']
 * // ]
 */
export function parseStyleString(cssText: string): StyleTuple[] {
  const raw = parseDeclarations(cssText);
  return raw.flatMap(([prop, val]) => expand(prop, val));
}

/**
 * Parse and merge inline styles from an HTMLElement's style attribute.
 * Returns a Map for O(1) lookup by atomic key.
 *
 * @example
 * const styles = parseElement(tdElement);
 * styles.get('borderTopWidth') // → '1px'
 */
export function parseElement(el: HTMLElement): Map<AtomicKey, string> {
  const styleStr = el.style.cssText; // get raw cssText (not a live map)
  if (STYLE_CACHE.has(styleStr)) {
    return STYLE_CACHE.get(styleStr)!;
  }
  const styles = mergeStyles(parseStyleString(styleStr));
  STYLE_CACHE.set(styleStr, styles);
  return styles;
}

/**
  return mergeStyles(parseStyleString(styleStr));
}

/**
 * Get a style value from an element. Accepts atomic keys, base shorthands,
 * and per-side border shorthands. Returns null if no relevant styles are set.
 *
 * Atomic key      → exact value
 *   getStyle(el, 'borderTopWidth')  // → '1px'
 *
 * Base shorthand  → serialized if all sides/parts present, else null
 *   getStyle(el, 'border')          // → '1px solid red'  (all sides equal)
 *   getStyle(el, 'padding')         // → '4px 8px'        (T==B, R==L)
 *   getStyle(el, 'margin')          // → '4px 8px 2px 0'  (all different)
 *
 * Per-side border → serialized parts for that side
 *   getStyle(el, 'borderTop')       // → '2px dashed blue'
 */
export function getStyle(el: HTMLElement, key: StyleKey): string | null {
  const map = parseElement(el);
  // 1. Direct atomic lookup
  // if (isAtomicKey(key)) return map.get(key) ?? null;
  if (key in map) {
    const val = map.get(key as AtomicKey);
    if (val !== undefined) return val; // should never be undefined..
  }

  // 2. Per-side border shorthand: 'borderTop' | 'borderRight' | ...
  const borderSide = SIDES.find((s) => key === `border${s}`);
  if (borderSide) return serializeBorderSide(map, borderSide);

  // 3. Base shorthands
  switch (key as StyleBase) {
    case 'border':
      return serializeBorder(map);
    case 'padding':
      return serializeSides(map, 'padding');
    case 'margin':
      return serializeSides(map, 'margin');
    case 'background':
      return map.get('backgroundColor') ?? null;
    default:
      return map.get(key as AtomicKey) ?? null;
  }
}

/**
 * Get all atomic values for a given base style from an element.
 *
 * @example
 * getBaseStyles(tdElement, 'border')
 * // → Map { 'borderTopWidth' => '1px', 'borderTopStyle' => 'solid', ... }
 */
export function getBaseStyles(
  el: HTMLElement,
  base: StyleBase
): Map<AtomicKey, string> {
  const all = parseElement(el);
  const result = new Map<AtomicKey, string>();
  for (const [key, value] of all) {
    if (key.startsWith(base)) result.set(key, value);
  }
  return result;
}

/**
 * Given an array of StyleTuples (possibly with duplicates), returns a
 * deduplicated map where later entries take precedence – matching CSS cascade.
 */
export function mergeStyles(tuples: StyleTuple[]): Map<AtomicKey, string> {
  const map = new Map<AtomicKey, string>();
  for (const [key, value] of tuples) {
    map.set(key, value); // later wins
  }
  return map;
}

export function parseStyleMap(cssText: string): Map<AtomicKey, string> {
  return mergeStyles(parseStyleString(cssText));
}

// ---------------------------------------------------------------------------
// Shorthand serialization (atomic → shorthand string)
// ---------------------------------------------------------------------------

/**
 * Compress four side values to the minimal CSS shorthand token string.
 *   all equal          → "T"
 *   T==B, R==L         → "T R"
 *   R==L               → "T R B"
 *   all different      → "T R B L"
 * Returns null if any side is missing.
 */
function serializeSides(
  map: Map<AtomicKey, string>,
  base: string
): string | null {
  const T = map.get(`${base}Top` as AtomicKey);
  const R = map.get(`${base}Right` as AtomicKey);
  const B = map.get(`${base}Bottom` as AtomicKey);
  const L = map.get(`${base}Left` as AtomicKey);
  if (!T || !R || !B || !L) return null;
  if (T === R && T === B && T === L) return T;
  if (T === B && R === L) return `${T} ${R}`;
  if (R === L) return `${T} ${R} ${B}`;
  return `${T} ${R} ${B} ${L}`;
}

/**
 * Serialize border parts (width style color) for one side.
 * Returns null if no parts are present.
 */
function serializeBorderSide(
  map: Map<AtomicKey, string>,
  side: Side
): string | null {
  const w = map.get(`border${side}Width` as AtomicKey);
  const s = map.get(`border${side}Style` as AtomicKey);
  const c = map.get(`border${side}Color` as AtomicKey);
  if (!w && !s && !c) return null;
  return [w, s, c].filter(Boolean).join(' ');
}

/**
 * Try to collapse all four border-side shorthands into a single 'border' value.
 * Only possible when all four sides are identical.
 */
function serializeBorder(map: Map<AtomicKey, string>): string | null {
  const sides = SIDES.map((side) => serializeBorderSide(map, side));
  if (sides.some((s) => s === null)) return null;
  // All sides equal → can use 'border' shorthand
  if (sides.every((s) => s === sides[0])) return sides[0]!;
  return null; // sides differ – caller must use per-side keys
}
