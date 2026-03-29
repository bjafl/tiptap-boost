type BorderAttrs = {
  borderTop?: string | null;
  borderRight?: string | null;
  borderBottom?: string | null;
  borderLeft?: string | null;
};

// ── Per-node style builders for renderHTML ─────────────────────────────────

type CellAttrs = {
  backgroundColor?: string | null;
  padding?: string | null;
  textAlign?: string | null;
  verticalAlign?: string | null;
};

export function cellStyle(attrs: CellAttrs & BorderAttrs) {
  console.log('cellStyle attrs:', attrs); // Debug log to inspect the input attributes
  const rules = [
    attrs.backgroundColor && `background-color: ${attrs.backgroundColor}`,
    attrs.padding && `padding: ${attrs.padding}`,
    attrs.textAlign && `text-align: ${attrs.textAlign}`,
    attrs.verticalAlign && `vertical-align: ${attrs.verticalAlign}`,
    attrs.borderTop ? `border-top: ${attrs.borderTop}` : 'border-top: none',
    attrs.borderRight
      ? `border-right: ${attrs.borderRight}`
      : 'border-right: none',
    attrs.borderBottom
      ? `border-bottom: ${attrs.borderBottom}`
      : 'border-bottom: none',
    attrs.borderLeft ? `border-left: ${attrs.borderLeft}` : 'border-left: none',
  ]
    .filter(Boolean)
    .join('; ');

  return rules ? { style: rules } : {};
}

type RowAttrs = {
  backgroundColor?: string | null;
  height?: string | null;
};

export function rowStyle(attrs: RowAttrs) {
  const rules = [
    attrs.backgroundColor && `background-color: ${attrs.backgroundColor}`,
    attrs.height && `height: ${attrs.height}`,
  ]
    .filter(Boolean)
    .join('; ');

  return rules ? { style: rules } : {};
}

type TableAttrs = {
  width?: string | null;
  backgroundColor?: string | null;
};

export function tableStyle(attrs: TableAttrs) {
  const rules = [
    attrs.backgroundColor && `background-color: ${attrs.backgroundColor}`,
    attrs.width && `width: ${attrs.width}`,
  ]
    .filter(Boolean)
    .join('; ');

  return rules ? { style: rules } : {};
}
