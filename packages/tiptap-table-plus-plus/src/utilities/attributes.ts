import { getStyle } from '../lib/inlineParser';

// ── Individual reusable attribute definitions ──────────────────────────────

export const backgroundColorAttr = (keepOnSplit = true) => ({
  default: null,
  keepOnSplit,
  parseHTML: (el: HTMLElement) => getStyle(el, 'background'),
  renderHTML: ({ backgroundColor }: any) =>
    backgroundColor ? { style: `background-color: ${backgroundColor}` } : {},
});

export const paddingAttr = (keepOnSplit = true) => ({
  default: null,
  keepOnSplit,
  parseHTML: (el: HTMLElement) => getStyle(el, 'padding'),
  renderHTML: ({ padding }: any) =>
    padding ? { style: `padding: ${padding}` } : {},
});

export const heightAttr = (keepOnSplit = false) => ({
  default: null,
  keepOnSplit,
  parseHTML: (el: HTMLElement) =>
    getStyle(el, 'height') || el.getAttribute('height'),
  renderHTML: ({ height }: any) =>
    height ? { style: `height: ${height}` } : {},
});

export const widthAttr = (keepOnSplit = false) => ({
  default: null,
  keepOnSplit,
  parseHTML: (el: HTMLElement) =>
    getStyle(el, 'width') || el.getAttribute('width'),
  renderHTML: ({ width }: any) => (width ? { style: `width: ${width}` } : {}),
});

export const textAlignAttr = (keepOnSplit = true) => ({
  default: null,
  keepOnSplit,
  parseHTML: (el: HTMLElement) =>
    getStyle(el, 'textAlign') || el.getAttribute('align'),
  renderHTML: ({ textAlign }: any) =>
    textAlign ? { style: `text-align: ${textAlign}` } : {},
});

export const verticalAlignAttr = (keepOnSplit = true) => ({
  default: null,
  keepOnSplit,
  parseHTML: (el: HTMLElement) =>
    getStyle(el, 'verticalAlign') || el.getAttribute('valign'),
  renderHTML: ({ verticalAlign }: any) =>
    verticalAlign ? { style: `vertical-align: ${verticalAlign}` } : {},
});

// ── Border attrs as a group ────────────────────────────────────────────────
// These are almost always used together, so group them.
type Side = 'Top' | 'Right' | 'Bottom' | 'Left';
const SIDES: Side[] = ['Top', 'Right', 'Bottom', 'Left'];

// Generates border attrs for all sides
export const borderAttrs = (keepOnSplit = false) =>
  Object.fromEntries(
    SIDES.map((side) => {
      const s = side.toLowerCase(); // e.g. 'top'
      return [
        `border${side}`,
        {
          default: null,
          keepOnSplit,
          parseHTML: (el: HTMLElement) => getStyle(el, `border${side}`),
          renderHTML: (attrs: any) => {
            const v = attrs[`border${side}`];
            return v ? { style: `border-${s}: ${v}` } : {};
          },
        },
      ];
    })
  );
