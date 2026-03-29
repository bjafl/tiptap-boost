import { mergeAttributes } from "@tiptap/core";
import TableRow from "@tiptap/extension-table-row";
import {
  backgroundColorAttr,
  heightAttr,
  borderAttrs,
} from "../utilities/attributes";
import { rowStyle } from "../utilities/renderStyle";

export const TableRowPlus = TableRow.extend({
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("tr");
      dom.style.display = "grid";
      dom.style.gridTemplateColumns = `var(--cell-percentage)`;
      dom.style.position = "relative";

      // Only apply non-border row styles (background, height).
      // Border attrs are kept for parseHTML so they can be
      // normalized onto cells by the borderNormalize plugin.
      Object.assign(dom.style, rowStyle(node.attrs));
      return {
        dom,
        contentDOM: dom,
      };
    };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: backgroundColorAttr(false),
      height: heightAttr(false),
      ...borderAttrs(false),
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["tr", mergeAttributes(HTMLAttributes, rowStyle(node.attrs)), 0];
  },
});

export default TableRowPlus;
