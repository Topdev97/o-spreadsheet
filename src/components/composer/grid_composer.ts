import * as owl from "@odoo/owl";
import { fontSizeMap } from "../../fonts";
import { Rect, SpreadsheetEnv, Viewport, Zone } from "../../types/index";
import { Composer } from "./composer";

const { Component } = owl;
const { xml, css } = owl.tags;

const SCROLLBAR_WIDTH = 14;
const SCROLLBAR_HIGHT = 15;

const TEMPLATE = xml/* xml */ `
  <div class="o-grid-composer" t-att-style="containerStyle">
    <Composer
      focus="props.focus"
      inputStyle="composerStyle"
      t-on-keydown="onKeydown"
      t-on-content-width-changed="onWidthChanged"
      t-on-content-height-changed="onHeigthChanged"
    />
  </div>
`;
const COMPOSER_BORDER_WIDTH = 3 * 0.4 * window.devicePixelRatio || 1;
const CSS = css/* scss */ `
  .o-grid-composer {
    box-sizing: border-box;
    position: absolute;
    border: ${COMPOSER_BORDER_WIDTH}px solid #3266ca;
    white-space: nowrap;
  }
`;

interface Props {
  viewport: Viewport;
  focus: boolean;
  content: string;
}
/**
 * This component is a composer which positions itself on the grid at the anchor cell.
 * It also applies the style of the cell to the composer input.
 */
export class GridComposer extends Component<Props, SpreadsheetEnv> {
  static template = TEMPLATE;
  static style = CSS;
  static components = { Composer };

  private getters = this.env.getters;
  private zone: Zone;
  private rect: Rect;

  constructor() {
    super(...arguments);
    const [col, row] = this.getters.getPosition();
    this.zone = this.getters.expandZone(this.getters.getActiveSheetId(), {
      left: col,
      right: col,
      top: row,
      bottom: row,
    });
    this.rect = this.getters.getRect(this.zone, this.props.viewport);
  }

  get containerStyle(): string {
    const isFormula = this.getters.getCurrentContent().startsWith("=");
    const style = this.getters.getCurrentStyle();

    // position style
    const [left, top, width, height] = this.rect;

    // color style
    const background = (!isFormula && style.fillColor) || "#ffffff";
    const color = (!isFormula && style.textColor) || "#000000";

    // font style
    const fontSize = (!isFormula && style.fontSize) || 10;
    const fontWeight = !isFormula && style.bold ? "bold" : 500;
    const fontStyle = !isFormula && style.italic ? "italic" : "normal";
    const textDecoration = !isFormula && style.strikethrough ? "line-through" : "none";

    // align style
    let textAlign = "left";

    if (!isFormula) {
      const cell = this.getters.getActiveCell() || { type: "text" };
      textAlign = style.align || cell.type === "number" ? "right" : "left";
    }

    return `
      left: ${left - 1}px;
      top: ${top}px;
      width: ${width}px;
      height: ${height + 1}px;

      background: ${background};
      color: ${color};

      font-size: ${fontSizeMap[fontSize]}px;
      font-weight: ${fontWeight};
      font-style: ${fontStyle};
      text-decoration: ${textDecoration};

      text-align: ${textAlign};
    `;
  }

  get composerStyle(): string {
    const height = this.rect[3] - COMPOSER_BORDER_WIDTH * 2 + 1;
    return `
      height: ${height}px;
      line-height:${height}px;
    `;
  }

  mounted() {
    const el = this.el!;
    const width = Math.max(el.scrollWidth, this.rect[2]);
    this.resizeWidth(width, 0);
    const height = Math.max(el.scrollHeight, this.rect[3]);
    this.resizeHeigth(height);
  }

  onWidthChanged(ev: CustomEvent) {
    const paddingWidth = this.props.focus ? 40 : 0;
    this.resizeWidth(ev.detail.newWidth + paddingWidth, 10);
  }

  onHeigthChanged(ev: CustomEvent) {
    const paddingHeight = this.props.focus ? 2 : 0;
    this.resizeHeigth(ev.detail.newHeight + paddingHeight);
  }

  onKeydown(ev: KeyboardEvent) {
    // In selecting mode, arrows should not move the cursor but it should
    // select adjacent cells on the grid.
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(ev.key)) {
      ev.preventDefault();
    }
  }

  private resizeWidth(width: number, step: number) {
    const el = this.el! as HTMLInputElement;
    const maxWidth = el.parentElement!.clientWidth - this.rect[0] - SCROLLBAR_WIDTH;
    let newWidth = Math.max(width + step, this.rect[2] + 0.5);
    if (newWidth > maxWidth) {
      el.style.whiteSpace = "normal";
      newWidth = maxWidth;
    } else {
      el.style.whiteSpace = "none";
    }
    el.style.width = (newWidth + "px") as string;
  }

  private resizeHeigth(height: number) {
    const el = this.el! as HTMLInputElement;
    const maxHeight = el.parentElement!.clientHeight - this.rect[1] - SCROLLBAR_HIGHT;
    let newHeight = Math.max(height + 1, this.rect[3]);
    if (newHeight > maxHeight) {
      el.style.overflow = "hidden";
      newHeight = maxHeight;
    }
    el.style.height = (newHeight + "px") as string;
  }
}
