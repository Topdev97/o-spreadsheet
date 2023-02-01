import { Component } from "@odoo/owl";
import { Pixel, SpreadsheetChildEnv } from "../../types";
import { css } from "../helpers";
import { ColorPicker } from "./color_picker";

interface Props {
  currentColor: string | undefined;
  toggleColorPicker: () => void;
  showColorPicker: boolean;
  onColorPicked: (color: string) => void;
  icon: string;
  dropdownDirection?: "left" | "right" | "center";
  title?: string;
  disabled?: boolean;
  dropdownMaxHeight?: Pixel;
  class?: string;
}

css/* scss */ `
  .o-color-picker-widget {
    display: inline-block;
    position: relative;

    .o-color-picker-button-style {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 2px;
      padding: 3px;
      border-radius: 2px;
      cursor: pointer;
      &:not([disabled]):hover {
        background-color: rgba(0, 0, 0, 0.08);
      }
    }

    .o-color-picker-button {
      > span {
        border-bottom: 4px solid;
        height: 16px;
        margin-top: 2px;
      }

      &[disabled] {
        pointer-events: none;
        opacity: 0.3;
      }
    }
  }
`;

export class ColorPickerWidget extends Component<Props, SpreadsheetChildEnv> {
  static template = "o-spreadsheet-ColorPickerWidget";
  static components = { ColorPicker };

  get iconStyle() {
    return this.props.currentColor
      ? `border-color: ${this.props.currentColor}`
      : "border-bottom-style: hidden";
  }
}

ColorPickerWidget.props = {
  currentColor: { type: String, optional: true },
  toggleColorPicker: Function,
  showColorPicker: Boolean,
  onColorPicked: Function,
  icon: String,
  dropdownDirection: { type: String, optional: true },
  title: { type: String, optional: true },
  disabled: { type: Boolean, optional: true },
  dropdownMaxHeight: { type: Number, optional: true },
  class: { type: String, optional: true },
};
