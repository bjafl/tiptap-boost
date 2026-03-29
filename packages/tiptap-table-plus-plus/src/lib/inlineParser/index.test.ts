/**
 * inline-style-parser.test.ts
 *
 * Run with:  npx tsx inline-style-parser.test.ts
 *
 * No test framework needed – uses a minimal assert helper.
 * Tests are grouped by feature area.
 */

import {
  parseStyleString,
  parseStyleMap,
  mergeStyles,
  getBaseStyles,
  AtomicKey,
  StyleQuery,
  StyleCache,
} from '.';

// ---------------------------------------------------------------------------
// Minimal test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function eq(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    failures.push(
      `  FAIL  ${label}\n         got:      ${a}\n         expected: ${e}`
    );
  }
}

/** Convenience: parse cssText and look up one atomic key */
function get(cssText: string, key: AtomicKey): string | null {
  return parseStyleMap(cssText).get(key) ?? null;
}

/** Convenience: parse and look up a StyleQuery via serialize helpers */
function query(cssText: string, key: StyleQuery): string | null {
  const map = parseStyleMap(cssText);

  // Inline the same logic as getStyle() but without HTMLElement dependency
  const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;
  type Side = (typeof SIDES)[number];

  function isAtomicKey(s: string): s is AtomicKey {
    return map.has(s as AtomicKey) || [...map.keys()].some(() => false); // always check via map; good enough for tests
  }

  // Serialize four side values (padding/margin)
  function serializeSides(base: string): string | null {
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

  function serializeBorderSide(side: Side): string | null {
    const w = map.get(`border${side}Width` as AtomicKey);
    const s = map.get(`border${side}Style` as AtomicKey);
    const c = map.get(`border${side}Color` as AtomicKey);
    if (!w && !s && !c) return null;
    return [w, s, c].filter(Boolean).join(' ');
  }

  function serializeBorder(): string | null {
    const sides = SIDES.map(serializeBorderSide);
    if (sides.some((s) => s === null)) return null;
    if (sides.every((s) => s === sides[0])) return sides[0]!;
    return null;
  }

  // Dispatch
  if (map.has(key as AtomicKey)) return map.get(key as AtomicKey)!;
  const borderSide = SIDES.find((s) => key === `border${s}`);
  if (borderSide) return serializeBorderSide(borderSide);
  switch (key) {
    case 'border':
      return serializeBorder();
    case 'padding':
      return serializeSides('padding');
    case 'margin':
      return serializeSides('margin');
    case 'background':
      return map.get('backgroundColor') ?? null;
    default:
      return map.get(key as AtomicKey) ?? null;
  }
}

// ---------------------------------------------------------------------------
// 1. Simple / atomic styles
// ---------------------------------------------------------------------------

eq('height passthrough', get('height: 100px', 'height'), '100px');
eq('width passthrough', get('width: 50%', 'width'), '50%');
eq('textAlign passthrough', get('text-align: center', 'textAlign'), 'center');
eq(
  'verticalAlign passthrough',
  get('vertical-align: middle', 'verticalAlign'),
  'middle'
);
eq('kebab-case to camelCase', get('text-align: right', 'textAlign'), 'right');
eq(
  'unsupported prop dropped',
  get('display: flex; height: 10px', 'height'),
  '10px'
);
eq('empty string → no tuples', parseStyleString('').length, 0);
eq('whitespace only → no tuples', parseStyleString('   ').length, 0);

// ---------------------------------------------------------------------------
// 2. Background
// ---------------------------------------------------------------------------

eq(
  'background-color atomic',
  get('background-color: red', 'backgroundColor'),
  'red'
);
eq(
  'background shorthand color',
  get('background: #abc', 'backgroundColor'),
  '#abc'
);
eq(
  'background query shorthand',
  query('background-color: blue', 'background'),
  'blue'
);
// Multi-token background shorthand: color not extracted (too ambiguous)
eq(
  'background multi-token → null',
  query('background: url(x.png) no-repeat center', 'background'),
  null
);

// ---------------------------------------------------------------------------
// 3. Padding
// ---------------------------------------------------------------------------

eq('padding 1-value: all sides', query('padding: 8px', 'padding'), '8px');

eq(
  'padding 2-value: T/B and L/R',
  query('padding: 4px 8px', 'padding'),
  '4px 8px'
);

eq('padding 3-value', query('padding: 1px 2px 3px', 'padding'), '1px 2px 3px');

// eq(
//   'padding 4-value',
//   query('padding: 1px 2px 3px 4px', 'padding'),
//   '1px 2px 4px' === '1px 2px 3px 4px' ? '1px 2px 3px 4px' : '1px 2px 3px 4px'
// );

eq(
  'padding atomic sides from shorthand',
  get('padding: 10px 20px', 'paddingTop'),
  '10px'
);
eq(
  'padding atomic sides from shorthand',
  get('padding: 10px 20px', 'paddingRight'),
  '20px'
);
eq(
  'padding atomic sides from shorthand',
  get('padding: 10px 20px', 'paddingBottom'),
  '10px'
);
eq(
  'padding atomic sides from shorthand',
  get('padding: 10px 20px', 'paddingLeft'),
  '20px'
);

eq('paddingTop atomic', get('padding-top: 5px', 'paddingTop'), '5px');
eq('paddingLeft atomic', get('padding-left: 3px', 'paddingLeft'), '3px');

// Override: later declaration wins
eq(
  'padding cascade: atomic overrides shorthand',
  get('padding: 10px; padding-top: 99px', 'paddingTop'),
  '99px'
);

// ---------------------------------------------------------------------------
// 4. Margin
// ---------------------------------------------------------------------------

eq('margin 1-value', query('margin: 0', 'margin'), '0');
eq('margin 2-value', query('margin: 0 auto', 'margin'), '0 auto');
eq('marginTop atomic', get('margin-top: 12px', 'marginTop'), '12px');

// ---------------------------------------------------------------------------
// 5. Border – position-agnostic parsing
// ---------------------------------------------------------------------------

// Standard order
eq(
  'border: width style color',
  get('border: 1px solid red', 'borderTopWidth'),
  '1px'
);
eq(
  'border: width style color – style',
  get('border: 1px solid red', 'borderTopStyle'),
  'solid'
);
eq(
  'border: width style color – color',
  get('border: 1px solid red', 'borderTopColor'),
  'red'
);

// Non-standard order: color first
eq(
  'border color-first order',
  get('border: red solid 2px', 'borderTopColor'),
  'red'
);
eq(
  'border color-first: width still parsed',
  get('border: red solid 2px', 'borderTopWidth'),
  '2px'
);
eq(
  'border color-first: style still parsed',
  get('border: red solid 2px', 'borderTopStyle'),
  'solid'
);

// Only style
eq('border style-only', get('border: dashed', 'borderTopStyle'), 'dashed');
eq(
  'border style-only → no width',
  get('border: dashed', 'borderTopWidth'),
  null
);

// Only width
eq('border width-only', get('border: 3px', 'borderTopWidth'), '3px');
eq('border width-only → no style', get('border: 3px', 'borderTopStyle'), null);

// Width keywords
eq(
  'border width keyword thin',
  get('border: thin solid black', 'borderTopWidth'),
  'thin'
);
eq(
  'border width keyword thick',
  get('border: thick', 'borderTopWidth'),
  'thick'
);

// Named colors (not mistaken for style or width)
eq(
  'border named color: blue',
  get('border: 1px solid blue', 'borderTopColor'),
  'blue'
);
eq(
  'border named color: transparent',
  get('border: transparent', 'borderTopColor'),
  'transparent'
);

// Hex color
eq(
  'border hex color',
  get('border: 2px solid #ff0000', 'borderTopColor'),
  '#ff0000'
);

// rgb() – paren-group rejoining
eq(
  'border rgb() color',
  get('border: 1px solid rgb(255, 0, 0)', 'borderTopColor'),
  'rgb(255, 0, 0)'
);

// oklch() – multi-token color function
eq(
  'border oklch() color',
  get('border: 2px dashed oklch(50% 0.2 270)', 'borderTopColor'),
  'oklch(50% 0.2 270)'
);

// color function first, then width and style
eq(
  'border color-function first',
  get('border: rgb(0,128,0) 1px dotted', 'borderTopStyle'),
  'dotted'
);

// All four sides get the same value from shorthand
eq(
  'border all sides: Right',
  get('border: 1px solid red', 'borderRightWidth'),
  '1px'
);
eq(
  'border all sides: Bottom',
  get('border: 1px solid red', 'borderBottomStyle'),
  'solid'
);
eq(
  'border all sides: Left',
  get('border: 1px solid red', 'borderLeftColor'),
  'red'
);

// Per-side shorthand
eq(
  'borderTop shorthand',
  get('border-top: 2px dashed blue', 'borderTopWidth'),
  '2px'
);
eq(
  'borderTop shorthand style',
  get('border-top: 2px dashed blue', 'borderTopStyle'),
  'dashed'
);
eq(
  'borderTop shorthand color',
  get('border-top: 2px dashed blue', 'borderTopColor'),
  'blue'
);
eq(
  'borderTop does not affect Bottom',
  get('border-top: 2px dashed blue', 'borderBottomWidth'),
  null
);

// Atomic borderTopWidth
eq(
  'borderTopWidth atomic',
  get('border-top-width: 4px', 'borderTopWidth'),
  '4px'
);
eq(
  'borderTopWidth does not affect Right',
  get('border-top-width: 4px', 'borderRightWidth'),
  null
);

// ---------------------------------------------------------------------------
// 6. Border serialization queries
// ---------------------------------------------------------------------------

eq(
  'query borderTop serialized',
  query('border-top: 2px dashed blue', 'borderTop'),
  '2px dashed blue'
);

eq(
  'query border uniform → single shorthand',
  query('border: 1px solid red', 'border'),
  '1px solid red'
);

eq(
  'query border non-uniform sides → null',
  query('border: 1px solid red; border-top-width: 2px', 'border'),
  null
);

eq(
  'query borderRight after full border',
  query('border: 1px solid green', 'borderRight'),
  '1px solid green'
);

// ---------------------------------------------------------------------------
// 7. Cascade / override behaviour
// ---------------------------------------------------------------------------

eq(
  'later shorthand overrides earlier atomic',
  get('border-top-width: 99px; border: 1px solid red', 'borderTopWidth'),
  '1px'
);

eq(
  'later atomic overrides earlier shorthand',
  get('border: 1px solid red; border-top-width: 99px', 'borderTopWidth'),
  '99px'
);

eq(
  'later padding overrides earlier',
  get('padding: 5px; padding: 10px', 'paddingTop'),
  '10px'
);

// ---------------------------------------------------------------------------
// 8. Edge cases
// ---------------------------------------------------------------------------

eq('semicolon at end', get('height: 50px;', 'height'), '50px');
eq(
  'extra spaces in value',
  get('border:  1px  solid  red', 'borderTopWidth'),
  '1px'
);
eq(
  'mixed-case property (invalid in real CSS, dropped gracefully)',
  parseStyleString('BORDER: 1px solid red').length,
  0
);

// ---------------------------------------------------------------------------
// 9. border: none / border: 0
// ---------------------------------------------------------------------------

eq(
  'border: none → style is none',
  get('border: none', 'borderTopStyle'),
  'none'
);
eq(
  'border: none → no width',
  get('border: none', 'borderTopWidth'),
  null
);
eq('border: 0 → width is 0', get('border: 0', 'borderTopWidth'), '0');

// ---------------------------------------------------------------------------
// 10. Multiple per-side borders in one string
// ---------------------------------------------------------------------------

eq(
  'border-top + border-bottom in one string: top',
  get('border-top: 1px solid red; border-bottom: 2px dashed blue', 'borderTopWidth'),
  '1px'
);
eq(
  'border-top + border-bottom in one string: bottom',
  get('border-top: 1px solid red; border-bottom: 2px dashed blue', 'borderBottomWidth'),
  '2px'
);
eq(
  'border-top + border-bottom: top color',
  get('border-top: 1px solid red; border-bottom: 2px dashed blue', 'borderTopColor'),
  'red'
);
eq(
  'border-top + border-bottom: bottom color',
  get('border-top: 1px solid red; border-bottom: 2px dashed blue', 'borderBottomColor'),
  'blue'
);
eq(
  'per-side borders: unset side is null',
  get('border-top: 1px solid red; border-bottom: 2px dashed blue', 'borderLeftWidth'),
  null
);

// ---------------------------------------------------------------------------
// 11. mergeStyles
// ---------------------------------------------------------------------------

{
  const tuples = parseStyleString('border: 1px solid red; padding: 4px 8px');
  const map = mergeStyles(tuples);
  eq('mergeStyles: borderTopWidth', map.get('borderTopWidth') ?? null, '1px');
  eq('mergeStyles: paddingRight', map.get('paddingRight') ?? null, '8px');
  eq('mergeStyles: size', map.size, 16); // 12 border + 4 padding
}

{
  // later wins
  const tuples = parseStyleString('border-top-width: 5px; border-top-width: 10px');
  const map = mergeStyles(tuples);
  eq('mergeStyles: later wins', map.get('borderTopWidth') ?? null, '10px');
}

// ---------------------------------------------------------------------------
// 12. StyleCache
// ---------------------------------------------------------------------------

{
  const cache = new StyleCache(4, 0.5); // small cache: max 4, evict 50%

  const m1 = new Map<AtomicKey, string>([['height', '10px']]);
  const m2 = new Map<AtomicKey, string>([['width', '20px']]);
  const m3 = new Map<AtomicKey, string>([['height', '30px']]);
  const m4 = new Map<AtomicKey, string>([['width', '40px']]);
  const m5 = new Map<AtomicKey, string>([['height', '50px']]);

  // Basic set/get
  cache.set('a', m1);
  eq('cache: get hit', cache.get('a'), m1);
  eq('cache: same reference', cache.get('a') === m1, true);
  eq('cache: get miss', cache.get('z'), undefined);

  // has
  eq('cache: has hit', cache.has('a'), true);
  eq('cache: has miss', cache.has('z'), false);

  // size
  eq('cache: size after 1 set', cache.size(), 1);

  // Fill to capacity
  cache.set('b', m2);
  cache.set('c', m3);
  cache.set('d', m4);
  eq('cache: size at capacity', cache.size(), 4);

  // Eviction: inserting 5th triggers evict(ceil(4*0.5)) = evict(2)
  // Oldest two ('a', 'b') should be removed
  cache.set('e', m5);
  eq('cache: size after eviction', cache.size(), 3);
  eq('cache: oldest evicted (a)', cache.has('a'), false);
  eq('cache: oldest evicted (b)', cache.has('b'), false);
  eq('cache: recent kept (c)', cache.has('c'), true);
  eq('cache: recent kept (d)', cache.has('d'), true);
  eq('cache: new entry present (e)', cache.has('e'), true);

  // delete
  eq('cache: delete existing', cache.delete('c'), true);
  eq('cache: delete gone', cache.has('c'), false);
  eq('cache: delete nonexistent', cache.delete('zzz'), false);
  eq('cache: size after delete', cache.size(), 2);

  // clear
  cache.clear();
  eq('cache: size after clear', cache.size(), 0);
  eq('cache: get after clear', cache.get('d'), undefined);
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

console.log('\n' + '─'.repeat(60));
if (failures.length) {
  console.log('\nFailed tests:\n');
  failures.forEach((f) => console.log(f + '\n'));
}
console.log(
  `\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} tests`
);
console.log('─'.repeat(60) + '\n');
process.exit(failed > 0 ? 1 : 0);
