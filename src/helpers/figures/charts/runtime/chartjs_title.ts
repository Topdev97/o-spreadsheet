import { TitleOptions } from "chart.js";
import { _DeepPartialObject } from "chart.js/dist/types/utils";
import { DEFAULT_CHART_FONT_SIZE } from "../../../../constants";
import { _t } from "../../../../translation";
import { Getters } from "../../../../types";
import { ChartWithDataSetDefinition } from "../../../../types/chart";
import { chartFontColor, getEvaluatedChartTitle } from "../chart_common";

export function getChartTitle(
  getters: Getters,
  definition: ChartWithDataSetDefinition
): _DeepPartialObject<TitleOptions> {
  const chartTitle = getEvaluatedChartTitle(getters, definition.title);
  const fontColor = chartFontColor(definition.background);
  return {
    display: !!chartTitle.text,
    text: _t(chartTitle.text!),
    color: chartTitle?.color ?? fontColor,
    align:
      chartTitle.align === "center" ? "center" : chartTitle.align === "right" ? "end" : "start",
    font: {
      size: DEFAULT_CHART_FONT_SIZE,
      weight: chartTitle.bold ? "bold" : "normal",
      style: chartTitle.italic ? "italic" : "normal",
    },
  };
}
