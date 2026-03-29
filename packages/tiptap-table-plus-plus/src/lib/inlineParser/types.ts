import { STYLE_PROP_DEFS } from './config';
export type StyleBase = keyof typeof STYLE_PROP_DEFS;
export type StyleConfig = (typeof STYLE_PROP_DEFS)[StyleBase];

export type Side = 'Top' | 'Right' | 'Bottom' | 'Left';
export const SIDES: Side[] = ['Top', 'Right', 'Bottom', 'Left'];

// Helpers
export type Cap<S extends string> = S extends `${infer F}${infer R}`
  ? `${Uppercase<F>}${Lowercase<R>}`
  : S;
export type StyleSide<K extends StyleBase> =
  (typeof STYLE_PROP_DEFS)[K]['sides'] extends true ? Side : undefined;
export type StylePart<K extends StyleBase> =
  (typeof STYLE_PROP_DEFS)[K]['parts'] extends readonly []
    ? undefined
    : (typeof STYLE_PROP_DEFS)[K]['parts'] extends readonly (infer P extends
          string)[]
      ? Cap<P>
      : undefined;

type aaa = StylePart<'border'>;
type bbb = StylePart<'padding'>;
/**
 * Derives all atomic (fully-expanded) keys for a given base style.
 *
 * Examples:
 *   AtomicKeys<'border'>  → 'borderTopWidth' | 'borderTopStyle' | ... (12 keys)
 *   AtomicKeys<'padding'> → 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft'
 *   AtomicKeys<'height'>  → 'height'
 */
export type RelatedAtomicKey<K extends StyleBase = StyleBase> =
  StyleSide<K> extends infer S extends Side
    ? StylePart<K> extends infer P extends string
      ? `${K}${S}${P}`
      : `${K}${S}`
    : StylePart<K> extends infer P extends string
      ? `${K}${P}`
      : K;
export type AtomicKey = { [K in StyleBase]: RelatedAtomicKey<K> }[StyleBase]; // 'borderTopWidth' | 'borderTopStyle' | ... (12 keys)

/** Derives all valid style keys for supported styles */
export type StyleKey = {
  [K in StyleBase]: StyleSide<K> extends infer S extends Side
    ? StylePart<K> extends infer P extends string
      ? `${K}${S}` | `${K}${S}${P}` | K
      : `${K}${S}` | K
    : StylePart<K> extends infer P extends string
      ? K | `${K}${P}`
      : K;
}[StyleBase];

/** A single fully-expanded style declaration */
export type StyleTuple = [key: AtomicKey, value: string];

/** Raw (un-expanded) declaration straight from CSS text */
export type RawTuple = [key: string, value: string];

/** A mapping of side names to their corresponding values */
export type SideValues = Record<Side, string>;

type BorderSideKey = `border${Side}`;
export type StyleQuery = AtomicKey | StyleBase | BorderSideKey;
