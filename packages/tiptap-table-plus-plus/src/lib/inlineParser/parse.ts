// Matches first inline declaration in a string.

import { kebabToCamel } from './utils';
import { RawTuple, SideValues, StylePart } from './types';
import { getBase, isLineStyle, isLineWidth } from './utils';

// ---------------------------------------------------------------------------
// CSS Inline Declaration Parsing
// ---------------------------------------------------------------------------

// Groups: 1=declaration (no trailing ';') 2=property, 3=value, 4=next prop name (if matched)
const PATTERN_FIRST_DECL =
  /(^[\s;]*([a-z\-]+):(.+?))(?:(?:;[\s;]*([a-z\-]+:))|;[;\s]*|\s*$)/;
// Matches !important keyword at end of declaration value (only for single declaration or a valid value)
const PATTERN_IMPORTANT = /!important[;\s]*$/;

/**
 * Splits a CSS declaration string (semicolon-separated) into raw [property, value] pairs.
 * Properties are converted to camelCase. Unsupported bases are dropped.
 */
export function parseDeclarations(
  cssText: string,
  ignoreImportant: boolean = true
): RawTuple[] {
  //TODO: Handle !important?
  if (!ignoreImportant) {
    //TODO: Handle important in parsing?
    console.warn(
      'parseDeclarations: !important keyword are not currently handled and will always be ignored'
    );
  }

  let unparsed = cssText;
  const declarations: RawTuple[] = [];
  while (unparsed) {
    const match = unparsed.match(PATTERN_FIRST_DECL);
    if (!match) break; // no more valid declarations

    const rawProp = match[2].trim();
    const value = match[3].trim().replace(PATTERN_IMPORTANT, '').trim();
    const property = kebabToCamel(rawProp);
    if (getBase(property)) {
      // only include if base is supported style
      declarations.push([property, value]);
    }

    unparsed = unparsed.slice(match[1].length).trim();
  }
  return declarations;
}

// ---------------------------------------------------------------------------
// CSS Value Parsing
// ---------------------------------------------------------------------------

/**
 * Parses a border shorthand value by token *type*, not position.
 * Per spec: border = <line-width> || <line-style> || <color>
 * Any token not matching width or style is assumed to be color.
 *
 * Handles color functions with parens, e.g. rgb(0,0,0) or oklch(50% 0.2 270):
 * these are re-joined before classification since split(/\s+/) breaks them apart.
 */
export function parseBorderShorthand(
  value: string
): Record<StylePart<'border'>, string> {
  const result = {} as Record<StylePart<'border'>, string>;

  // Re-join paren-groups that were split across whitespace
  // e.g. "1px solid rgb(0, 0, 0)" → tokens: ['1px', 'solid', 'rgb(0,', '0,', '0)']
  // We merge tokens until all opened parens are closed.
  const rawTokens = value.trim().split(/\s+/);
  const tokens: string[] = [];
  let depth = 0;
  let current = '';
  for (const t of rawTokens) {
    depth += (t.match(/\(/g) ?? []).length;
    depth -= (t.match(/\)/g) ?? []).length;
    current += (current ? ' ' : '') + t;
    if (depth <= 0) {
      tokens.push(current);
      current = '';
      depth = 0;
    }
  }
  if (current) tokens.push(current); // unclosed paren fallback

  for (const token of tokens) {
    if (!result.Style && isLineStyle(token)) {
      result.Style = token;
    } else if (!result.Width && isLineWidth(token)) {
      result.Width = token;
    } else if (!result.Color) {
      result.Color = token; // assume color for anything else
    }
  }

  return result;
}

/**
 * CSS shorthand expansion (1–4 values):
 *   1 value  → all sides
 *   2 values → [top/bottom, left/right]
 *   3 values → [top, left/right, bottom]
 *   4 values → [top, right, bottom, left]
 */
export function parseSideShorthand(value: string): SideValues {
  const v = value.trim().split(/\s+/);
  switch (v.length) {
    case 1:
      return { Top: v[0], Right: v[0], Bottom: v[0], Left: v[0] };
    case 2:
      return { Top: v[0], Right: v[1], Bottom: v[0], Left: v[1] };
    case 3:
      return { Top: v[0], Right: v[1], Bottom: v[2], Left: v[1] };
    default:
      return { Top: v[0], Right: v[1], Bottom: v[2], Left: v[3] };
  }
}
