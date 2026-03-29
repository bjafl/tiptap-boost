import { parseBorderShorthand, parseSideShorthand } from './parse';
import { StyleTuple, Side, SIDES, AtomicKey } from './types';
import { getBase, isAtomicKey } from './utils';

/**
 * Expands a single raw declaration into one or more atomic StyleTuples.
 * Shorthand properties are fanned out; atomic properties pass through.
 */
export function expand(property: string, value: string): StyleTuple[] {
  const base = getBase(property);
  if (!base) return [];

  switch (base) {
    case 'border':
      return expandBorder(property, value);
    case 'padding':
      return expandSides('padding', property, value);
    case 'margin':
      return expandSides('margin', property, value);
    case 'background':
      return expandBackground(property, value);
    default: {
      // Simple atomic styles (height, width, textAlign, verticalAlign)
      if (isAtomicKey(property)) return [[property, value]];
      return [];
    }
  }
}

function expandBorder(property: string, value: string): StyleTuple[] {
  // Determine which sides are targeted
  const targetSides: Side[] = SIDES.filter((s) => property.includes(s));
  const sides = targetSides.length > 0 ? targetSides : SIDES;

  // Determine which part is targeted (Width / Style / Color), if any
  const parts = ['Width', 'Style', 'Color'] as const;
  type BorderPart = (typeof parts)[number];
  const targetPart = parts.find((p) => property.endsWith(p));

  const result: StyleTuple[] = [];

  if (targetPart) {
    // Fully atomic: e.g. borderTopWidth
    for (const side of sides) {
      const key = `border${side}${targetPart}` as AtomicKey;
      result.push([key, value]);
    }
  } else {
    // Shorthand: parse value into parts
    const parsed = parseBorderShorthand(value);
    for (const side of sides) {
      for (const [part, val] of Object.entries(parsed) as [
        BorderPart,
        string,
      ][]) {
        const key = `border${side}${part}` as AtomicKey;
        result.push([key, val]);
      }
    }
  }

  return result;
}

function expandSides(
  base: 'padding' | 'margin',
  property: string,
  value: string
): StyleTuple[] {
  const targetSide = SIDES.find((s) => property === `${base}${s}`);

  if (targetSide) {
    // Already atomic: e.g. paddingTop
    return [[`${base}${targetSide}` as AtomicKey, value]];
  }

  // Shorthand: expand to all four sides
  const sides = parseSideShorthand(value);
  return (Object.entries(sides) as [Side, string][]).map(([side, val]) => [
    `${base}${side}` as AtomicKey,
    val,
  ]);
}

function expandBackground(property: string, value: string): StyleTuple[] {
  if (property === 'backgroundColor') {
    return [['backgroundColor', value]];
  }
  // 'background' shorthand – only extract color (first token that looks like a color)
  // A proper background shorthand parser is complex; we keep it simple:
  // if the value is a single token (no spaces), treat as color.
  // Otherwise emit as-is and let callers handle it.
  const isSingleToken = !value.trim().includes(' ');
  if (isSingleToken) {
    return [['backgroundColor', value]];
  } //TODO
  // Multi-value background shorthand: not expanded further (color extraction is ambiguous)
  // Return empty – callers that need background-color should set it explicitly.
  return [];
}
