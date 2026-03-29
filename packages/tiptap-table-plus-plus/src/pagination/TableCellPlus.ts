import { TableCell } from '@tiptap/extension-table-cell';
import { mergeAttributes } from '@tiptap/core';
import {
  backgroundColorAttr,
  paddingAttr,
  textAlignAttr,
  verticalAlignAttr,
  borderAttrs,
} from '../utilities/attributes';
import { cellStyle } from '../utilities/renderStyle';
import { Node as ProsemirrorNode } from '@tiptap/pm/model';
import { BORDER_COLLAPSE_STYLE } from '../config';
import { BORDER_COLLAPSED_SENTINEL } from '../utilities/borderCollapse';

export const TableCellPlus = TableCell.extend({
  addNodeView() {
    return ({ node }) => {
      // const tableNode = this.editor.extensionManager.extensions.find(
      //   (extension) => extension.name === "table",
      // );
      // const borderColor = tableNode ? tableNode.options.borderColor : "black";
      const dom = document.createElement('td');
      const contentDOM = document.createElement('div');
      dom.appendChild(contentDOM);
      Object.assign(dom.style, cellStyle(node.attrs));
      applyCellAttrs(dom, node);
      return {
        dom,
        contentDOM,

        update(updatedNode) {
          if (updatedNode.type.name !== 'tableCell') return false;
          applyCellAttrs(dom, updatedNode);
          return true;
        },
      };
    };
  },
  addAttributes() {
    const borders = borderAttrs(true);
    return {
      ...this.parent?.(),
      backgroundColor: backgroundColorAttr(true),
      padding: paddingAttr(true),
      textAlign: textAlignAttr(true),
      verticalAlign: verticalAlignAttr(true),
      ...borders,
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const { colspan, rowspan, colwidth, ...rest } = node.attrs;
    const cellStyleObj = cellStyle(rest);
    const mergeTest = mergeAttributes(HTMLAttributes, cellStyleObj);
    console.log('mergeAttributes result:', {
      HTMLAttributes,
      cellStyleObj,
      mergeTest,
    }); // Debug log to inspect the merged attributes
    return [
      'td',
      mergeAttributes(HTMLAttributes, {
        colspan,
        rowspan,
        ...(colwidth ? { 'data-colwidth': colwidth } : {}),
        ...cellStyle(rest),
      }),
      0,
    ];
  },
});

function applyCellAttrs(
  dom: HTMLTableCellElement,
  node: ProsemirrorNode
): void {
  const {
    colspan,
    rowspan,
    backgroundColor,
    padding,
    textAlign,
    verticalAlign,
    borderTop,
    borderRight,
    borderBottom,
    borderLeft,
  } = node.attrs;

  // Grid / span
  dom.style.gridColumn = `auto / span ${colspan || 1}`;
  dom.rowSpan = rowspan || 1;
  dom.setAttribute('colspan', String(colspan || 1));
  dom.setAttribute('rowspan', String(rowspan || 1));

  // Reset before reapplying so cleared attrs don't linger
  dom.removeAttribute('style');
  dom.style.gridColumn = `auto / span ${colspan || 1}`; // restore after reset
  const preAssign = Object.entries(dom.style).filter(([key]) =>
    key.startsWith('border')
  );
  Object.assign(dom.style, {
    backgroundColor,
    padding,
    textAlign,
    verticalAlign,
    borderTop:
      borderTop === BORDER_COLLAPSED_SENTINEL
        ? BORDER_COLLAPSE_STYLE
        : borderTop,
    borderRight:
      borderRight === BORDER_COLLAPSED_SENTINEL
        ? BORDER_COLLAPSE_STYLE
        : borderRight,
    borderBottom:
      borderBottom === BORDER_COLLAPSED_SENTINEL
        ? BORDER_COLLAPSE_STYLE
        : borderBottom,
    borderLeft:
      borderLeft === BORDER_COLLAPSED_SENTINEL
        ? BORDER_COLLAPSE_STYLE
        : borderLeft,
  } as Record<string, string | null | undefined>);
  console.log('dom assign result:', {
    preAssign,
    postAssign: Object.entries(dom.style).filter(([key]) =>
      key.startsWith('border')
    ),
  }); // Debug log to inspect the style assignment
}

export default TableCellPlus;
