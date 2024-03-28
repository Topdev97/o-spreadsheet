import { Component, useExternalListener, useState } from "@odoo/owl";
import { _t } from "../../../../translation";
import { ScorecardChartDefinition } from "../../../../types/chart/scorecard_chart";
import { Color, DispatchResult, SpreadsheetChildEnv, UID } from "../../../../types/index";
import { ColorPickerWidget } from "../../../color_picker/color_picker_widget";
import { RoundColorPicker } from "../../components/round_color_picker/round_color_picker";
import { Section } from "../../components/section/section";
import { ChartTitle } from "../building_blocks/title/title";

type ColorPickerId = undefined | "backgroundColor" | "baselineColorUp" | "baselineColorDown";

interface Props {
  figureId: UID;
  definition: ScorecardChartDefinition;
  canUpdateChart: (figureId: UID, definition: Partial<ScorecardChartDefinition>) => DispatchResult;
  updateChart: (figureId: UID, definition: Partial<ScorecardChartDefinition>) => DispatchResult;
}

interface PanelState {
  openedColorPicker: ColorPickerId;
}

export class ScorecardChartDesignPanel extends Component<Props, SpreadsheetChildEnv> {
  static template = "o-spreadsheet-ScorecardChartDesignPanel";
  static components = { ColorPickerWidget, RoundColorPicker, ChartTitle, Section };
  static props = {
    figureId: String,
    definition: Object,
    updateChart: Function,
    canUpdateChart: Function,
  };

  private state: PanelState = useState({
    openedColorPicker: undefined,
  });

  setup() {
    useExternalListener(window, "click", this.closeMenus);
  }

  get title(): string {
    return _t(this.props.definition.title);
  }

  updateTitle(title: string) {
    this.props.updateChart(this.props.figureId, { title });
  }

  translate(term) {
    return _t(term);
  }

  updateBaselineDescr(ev) {
    this.props.updateChart(this.props.figureId, { baselineDescr: ev.target.value });
  }

  toggleColorPicker(colorPickerId: ColorPickerId) {
    if (this.state.openedColorPicker === colorPickerId) {
      this.state.openedColorPicker = undefined;
    } else {
      this.state.openedColorPicker = colorPickerId;
    }
  }

  setColor(color: Color, colorPickerId: ColorPickerId) {
    switch (colorPickerId) {
      case "backgroundColor":
        this.props.updateChart(this.props.figureId, { background: color });
        break;
      case "baselineColorDown":
        this.props.updateChart(this.props.figureId, { baselineColorDown: color });
        break;
      case "baselineColorUp":
        this.props.updateChart(this.props.figureId, { baselineColorUp: color });
        break;
    }
    this.closeMenus();
  }

  private closeMenus() {
    this.state.openedColorPicker = undefined;
  }
}
