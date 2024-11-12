import { ChartOptions } from "chart.js";
import { CHART_PADDING, CHART_PADDING_SMALL } from "../../../../constants";
import { ChartWithDataSetDefinition, GenericDefinition } from "../../../../types/chart";

type ChartLayout = ChartOptions["layout"];

export function getChartLayout(
  definition: GenericDefinition<ChartWithDataSetDefinition>
): ChartLayout {
  return {
    padding: {
      left: CHART_PADDING,
      right: CHART_PADDING,
      top:
        definition.title?.text || definition.legendPosition === "top"
          ? CHART_PADDING_SMALL
          : CHART_PADDING,
      bottom: CHART_PADDING_SMALL,
    },
  };
}
