import { mergeAttributes } from "@tiptap/core";
import TableHeader from "@tiptap/extension-table-header";
import { Node as ProsemirrorNode } from "@tiptap/pm/model";
import {
  backgroundColorAttr,
  paddingAttr,
  textAlignAttr,
  verticalAlignAttr,
  borderAttrs,
} from "../utilities/attributes";
import { cellStyle } from "../utilities/renderStyle";

function applyHeaderAttrs(
  dom: HTMLTableCellElement,
  node: ProsemirrorNode,
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

  dom.style.gridColumn = `auto / span ${colspan || 1}`;
  dom.rowSpan = rowspan || 1;
  dom.setAttribute("colspan", String(colspan || 1));
  dom.setAttribute("rowspan", String(rowspan || 1));

  dom.removeAttribute("style");
  dom.style.gridColumn = `auto / span ${colspan || 1}`;
  Object.assign(dom.style, {
    backgroundColor,
    padding,
    textAlign,
    verticalAlign,
    borderTop,
    borderRight,
    borderBottom,
    borderLeft,
  } as Record<string, string | null | undefined>);
}

export const TableHeaderPlus = TableHeader.extend({
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("th");
      const contentDOM = document.createElement("div");
      dom.appendChild(contentDOM);
      applyHeaderAttrs(dom, node);

      return {
        dom,
        contentDOM,

        update(updatedNode) {
          if (updatedNode.type.name !== "tableHeader") {
            return false;
          }
          applyHeaderAttrs(dom, updatedNode);
          return true;
        },
      };
    };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: backgroundColorAttr(true),
      padding: paddingAttr(true),
      textAlign: textAlignAttr(true),
      verticalAlign: verticalAlignAttr(true),
      ...borderAttrs(true),
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const { colspan, rowspan, colwidth, ...rest } = node.attrs;
    return [
      "th",
      mergeAttributes(HTMLAttributes, {
        colspan,
        rowspan,
        ...(colwidth ? { "data-colwidth": colwidth } : {}),
        ...cellStyle(rest),
      }),
      0,
    ];
  },
});

export default TableHeaderPlus;
