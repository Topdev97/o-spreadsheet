import { Component, useExternalListener, useState } from "@odoo/owl";
import { GRAY_300 } from "../../../../../constants";
import { getEvaluatedChartTitle } from "../../../../../helpers/figures/charts";
import { Color, SpreadsheetChildEnv, TitleDesign } from "../../../../../types";
import { ColorPickerWidget } from "../../../../color_picker/color_picker_widget";
import { StandaloneComposer } from "../../../../composer/standalone_composer/standalone_composer";
import { css } from "../../../../helpers";
import { Checkbox } from "../../../components/checkbox/checkbox";
import { Section } from "../../../components/section/section";

css/* scss */ `
  .o-chart-title-designer {
    > span {
      height: 30px;
    }

    .o-divider {
      border-right: 1px solid ${GRAY_300};
      margin: 0px 4px;
      height: 14px;
    }

    .o-menu-item-button.active {
      background-color: #e6f4ea;
      color: #188038;
    }

    .o-dropdown-content {
      overflow-y: auto;
      overflow-x: hidden;
      padding: 2px;
      z-index: 100;
      box-shadow: 1px 2px 5px 2px rgba(51, 51, 51, 0.15);

      .o-dropdown-line {
        > span {
          padding: 4px;
        }
      }
    }
  }
`;

interface Props {
  title?: string;
  updateTitle: (title: string) => void;
  name?: string;
  toggleItalic?: () => void;
  toggleBold?: () => void;
  updateAlignment?: (string) => void;
  updateColor?: (Color) => void;
  style: TitleDesign;
}

export interface ChartTitleState {
  activeTool: string;
  isComposerActive: boolean;
}

export class ChartTitle extends Component<Props, SpreadsheetChildEnv> {
  static template = "o-spreadsheet.ChartTitle";
  static components = { Section, ColorPickerWidget, Checkbox, StandaloneComposer };
  static props = {
    title: { type: String, optional: true },
    updateTitle: Function,
    name: { type: String, optional: true },
    toggleItalic: { type: Function, optional: true },
    toggleBold: { type: Function, optional: true },
    updateAlignment: { type: Function, optional: true },
    updateColor: { type: Function, optional: true },
    style: { type: Object, optional: true },
  };
  static defaultProps = {
    title: "",
  };
  openedEl: HTMLElement | null = null;

  setup() {
    useExternalListener(window, "click", this.onExternalClick);
  }

  state = useState({
    activeTool: "",
    isComposerActive: this.props.title?.startsWith("="),
  });

  updateTitle(ev: InputEvent) {
    this.props.updateTitle((ev.target as HTMLInputElement).value);
  }

  toggleDropdownTool(tool: string, ev: MouseEvent) {
    const isOpen = this.state.activeTool === tool;
    this.closeMenus();
    this.state.activeTool = isOpen ? "" : tool;
    this.openedEl = isOpen ? null : (ev.target as HTMLElement);
  }

  /**
   * TODO: This is clearly not a goot way to handle external click, but
   * we currently have no other way to do it ... Should be done in
   * another task to handle the fact we want only one menu opened at a
   * time with something like a menuStore ?
   */
  onExternalClick(ev: MouseEvent) {
    if (this.openedEl === ev.target) {
      return;
    }
    this.closeMenus();
  }

  onColorPicked(color: Color) {
    this.props.updateColor?.(color);
    this.closeMenus();
  }

  updateAlignment(aligment: "left" | "center" | "right") {
    this.props.updateAlignment?.(aligment);
    this.closeMenus();
  }

  closeMenus() {
    this.state.activeTool = "";
    this.openedEl = null;
  }

  toggleComposerMode(isComposerEnabled: boolean): void {
    let updatedTitle: string = "";

    if (!isComposerEnabled) {
      updatedTitle =
        getEvaluatedChartTitle(this.env.model.getters, {
          text: this.props.title,
        }).text || "";
    }

    this.props.updateTitle(updatedTitle);
    this.state.isComposerActive = isComposerEnabled;
  }

  handleComposerInput(formula: string) {
    this.props.updateTitle(formula.startsWith("=") ? formula : "=" + formula);
  }
}
