import {
  LENGTH_RE,
  LINE_STYLE_KEYWORDS,
  LINE_WIDTH_KEYWORDS,
  STYLE_PROP_DEFS,
} from './config';
import { StyleBase, StyleConfig, SIDES, AtomicKey } from './types';

let ATOMIC_KEY_SET: Set<string> | null = null;
/**
 * Builds the complete set of valid atomic keys from STYLES config.
 * Used for O(1) membership checks during parsing.
 */
export function getAtomicKeySet(): Set<string> {
  if (!ATOMIC_KEY_SET) {
    ATOMIC_KEY_SET = new Set<string>();
    for (const [base, cfg] of Object.entries(STYLE_PROP_DEFS) as [
      StyleBase,
      StyleConfig,
    ][]) {
      if (cfg.sides) {
        for (const side of SIDES) {
          if (cfg.parts.length === 0) {
            ATOMIC_KEY_SET.add(`${base}${side}`);
          } else {
            ATOMIC_KEY_SET.add(`${base}${side}`); // e.g. borderTop (shorthand per side)
            for (const part of cfg.parts) {
              ATOMIC_KEY_SET.add(`${base}${side}${cap(part)}`);
            }
          }
        }
      } else {
        ATOMIC_KEY_SET.add(base);
        for (const part of cfg.parts) {
          ATOMIC_KEY_SET.add(`${base}${cap(part)}`);
        }
      }
    }
  }
  return ATOMIC_KEY_SET;
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 'border-top-width' → 'borderTopWidth' */
export function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

export function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/**
 * Returns the StyleBase for a given property string, or null if unsupported.
 * Works for both shorthand ('border', 'borderTop') and atomic ('borderTopWidth').
 */
export function getBase(property: string): StyleBase | null {
  // Bases are sorted longest-first to avoid 'border' matching before 'borderRadius' etc.
  const bases = Object.keys(STYLE_PROP_DEFS) as StyleBase[];
  return bases.find((b) => property === b || property.startsWith(b)) ?? null;
}

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

export function isAtomicKey(s: string): s is AtomicKey {
  return getAtomicKeySet().has(s);
}

export function isLineStyle(token: string): boolean {
  return LINE_STYLE_KEYWORDS.has(token.toLowerCase());
}

export function isLineWidth(token: string): boolean {
  return LINE_WIDTH_KEYWORDS.has(token.toLowerCase()) || LENGTH_RE.test(token);
}
