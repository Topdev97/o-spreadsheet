const { Component } = owl;
const { xml, css } = owl.tags;

const TEMPLATE = xml/* xml */ `
    <input class="o-composer" t-att-style="style"
      t-on-input="onInput"
      t-on-keydown="onKeydown" />
  `;

const CSS = css/* scss */ `
  .o-composer {
    position: absolute;
    border: 1.2px solid #4b89ff;
    font-family: arial;
    font-size: 12px;
    padding: 2px;
    padding-left: 3px;
  }
  .o-composer:focus {
    outline: none;
  }
`;

export class Composer extends Component {
  static template = TEMPLATE;
  static style = CSS;
  model = this.props.model;

  mounted() {
    this.el.value = this.model.currentContent;
    const { cols, selection } = this.model;
    const col = cols[selection.left];
    this.el.style.width = col.size + 1.5;
    this.el.style.width = Math.max(this.el.scrollWidth + 2, col.size + 1.5);
    this.el.focus();
  }

  get style() {
    const { cols, selection, rows, offsetX, offsetY } = this.model;
    const col = cols[selection.left];
    const row = rows[selection.top];
    const top = row.top - offsetY - 1;
    const height = row.size + 2;
    const cell = this.model.selectedCell || { _type: "text" };
    const style = this.model.getStyle();
    const weight = `font-weight:${style.bold ? "bold" : 500};`;
    const italic = style.italic ? `font-style: italic;` : ``;
    const strikethrough = style.strikethrough ? `text-decoration:line-through;` : ``;
    const align = "align" in style ? style.align : cell._type === "number" ? "right" : "left";
    const position =
      align === "left"
        ? `left: ${col.left - offsetX - 1}px;`
        : `right: ${this.model.clientWidth - (col.right - offsetX) - 1}px;`;
    return `${position}top:${top}px;height:${height};text-align:${align};${weight}${italic}${strikethrough}`;
  }

  onInput() {
    // write in place? or go through a method probably
    this.model.currentContent = this.el.value;
    if (this.el.clientWidth !== this.el.scrollWidth) {
      this.el.style.width = this.el.scrollWidth + 2;
    }
  }

  onKeydown(ev) {
    if (ev.key === "Enter") {
      this.model.moveSelection(0, 1);
    }
    if (ev.key === "Escape") {
      this.model.cancelEdition();
    }
    if (ev.key === "Tab") {
      ev.preventDefault();
      const deltaX = ev.shiftKey ? -1 : 1;
      this.model.moveSelection(deltaX, 0);
    }
  }
}
