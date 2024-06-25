import { createAction, createActions } from "./actions/action";
import { clipboardHandlersRegistries } from "./clipboard_handlers/index";
import { transformRangeData } from "./collaborative/ot/ot_helpers";
import { ComposerStore } from "./components/composer/composer/composer_store";
import { ComposerFocusStore } from "./components/composer/composer_focus_store";
import { ChartJsComponent } from "./components/figures/chart/chartJs/chartjs";
import { ScorecardChart } from "./components/figures/chart/scorecard/chart_scorecard";
import { FigureComponent } from "./components/figures/figure/figure";
import { ChartFigure } from "./components/figures/figure_chart/figure_chart";
import { Grid } from "./components/grid/grid";
import { HoveredCellStore } from "./components/grid/hovered_cell_store";
import { GridOverlay } from "./components/grid_overlay/grid_overlay";
import { useDragAndDropListItems } from "./components/helpers/drag_and_drop_hook";
import { useHighlights, useHighlightsOnHover } from "./components/helpers/highlight_hook";
import { Menu } from "./components/menu/menu";
import { Popover } from "./components/popover";
import { CellPopoverStore } from "./components/popover/cell_popover_store";
import { SelectionInput } from "./components/selection_input/selection_input";
import { SelectionInputStore } from "./components/selection_input/selection_input_store";
import {
  BarConfigPanel,
  GaugeChartConfigPanel,
  GaugeChartDesignPanel,
  LineBarPieConfigPanel,
  LineBarPieDesignPanel,
  LineConfigPanel,
  ScorecardChartConfigPanel,
  ScorecardChartDesignPanel,
  chartSidePanelComponentRegistry,
} from "./components/side_panel/chart";
import { ChartColor } from "./components/side_panel/chart/building_blocks/color/color";
import { ChartDataSeries } from "./components/side_panel/chart/building_blocks/data_series/data_series";
import { ChartErrorSection } from "./components/side_panel/chart/building_blocks/error_section/error_section";
import { ChartLabelRange } from "./components/side_panel/chart/building_blocks/label_range/label_range";
import { ChartTitle } from "./components/side_panel/chart/building_blocks/title/title";
import { ChartPanel } from "./components/side_panel/chart/main_chart_panel/main_chart_panel";
import { Checkbox } from "./components/side_panel/components/checkbox/checkbox";
import { Section } from "./components/side_panel/components/section/section";
import { FindAndReplaceStore } from "./components/side_panel/find_and_replace/find_and_replace_store";
import { SidePanelStore } from "./components/side_panel/side_panel/side_panel_store";
import { ValidationMessages } from "./components/validation_messages/validation_messages";
import {
  BOTTOMBAR_HEIGHT,
  DEFAULT_CELL_HEIGHT,
  DEFAULT_CELL_WIDTH,
  HEADER_HEIGHT,
  HEADER_WIDTH,
  HIGHLIGHT_COLOR,
  MIN_COL_WIDTH,
  MIN_ROW_HEIGHT,
  SCROLLBAR_WIDTH,
  TOPBAR_HEIGHT,
} from "./constants";
import { isEvaluationError, toBoolean, toJsDate, toNumber, toString } from "./functions/helpers";
import { FunctionRegistry, arg, functionRegistry } from "./functions/index";
import {
  ChartColors,
  chartFontColor,
  getDefaultChartJsRuntime,
  getFillingMode,
} from "./helpers/figures/charts";
import {
  UuidGenerator,
  colorToRGBA,
  computeTextWidth,
  createCurrencyFormat,
  deepCopy,
  deepEquals,
  expandZoneOnInsertion,
  formatValue,
  isDefined,
  isInside,
  isMarkdownLink,
  lazy,
  lettersToNumber,
  markdownLink,
  numberToLetters,
  overlap,
  parseMarkdownLink,
  positionToZone,
  reduceZoneOnDeletion,
  rgbaToHex,
  toCartesian,
  toUnboundedZone,
  toXC,
  toZone,
  union,
  unquote,
} from "./helpers/index";
import { openLink, urlRegistry, urlRepresentation } from "./helpers/links";
import {
  createEmptyExcelSheet,
  createEmptySheet,
  createEmptyWorkbookData,
} from "./migrations/data";
import {
  corePluginRegistry,
  coreViewsPluginRegistry,
  featurePluginRegistry,
  statefulUIPluginRegistry,
} from "./plugins/index";
import { clickableCellRegistry } from "./registries/cell_clickable_registry";
import {
  autoCompleteProviders,
  autofillModifiersRegistry,
  autofillRulesRegistry,
  cellMenuRegistry,
  cellPopoverRegistry,
  chartComponentRegistry,
  chartRegistry,
  colMenuRegistry,
  figureRegistry,
  inverseCommandRegistry,
  linkMenuRegistry,
  numberFormatMenuRegistry,
  otRegistry,
  rowMenuRegistry,
  topbarComponentRegistry,
  topbarMenuRegistry,
} from "./registries/index";
import {
  genericRepeat,
  repeatCommandTransformRegistry,
  repeatLocalCommandTransformRegistry,
} from "./registries/repeat_commands_registry";
import { sidePanelRegistry } from "./registries/side_panel_registry";
import { useLocalStore, useStore, useStoreProvider } from "./store_engine";
import { DependencyContainer } from "./store_engine/dependency_container";
import { SpreadsheetStore } from "./stores";
import { HighlightStore } from "./stores/highlight_store";
import { ModelStore } from "./stores/model_store";
import { NotificationStore } from "./stores/notification_store";
import { RendererStore } from "./stores/renderer_store";
import { AddFunctionDescription, isMatrix } from "./types";
import { errorTypes } from "./types/errors";
import { DEFAULT_LOCALE } from "./types/locale";
export { Revision } from "./collaborative/revisions";
export { tokenColors } from "./components/composer/composer/composer";
export { Spreadsheet } from "./components/index";
export { setDefaultSheetViewSize } from "./constants";
export { compile, compileTokens, functionCache } from "./formulas/compiler";
export {
  astToFormula,
  convertAstNodes,
  iterateAstNodes,
  parse,
  parseTokens,
} from "./formulas/parser";
export { tokenize } from "./formulas/tokenizer";
export { compress, decompress } from "./helpers/compression";
export { AbstractChart } from "./helpers/figures/charts";
export { findCellInNewZone } from "./helpers/zones";
export { load } from "./migrations/data";
export { Model } from "./model";
export { CorePlugin } from "./plugins/core_plugin";
export { UIPlugin } from "./plugins/ui_plugin";
export { Registry } from "./registries/registry";
export { setTranslationMethod } from "./translation";
export { CancelledReason, CommandResult, DispatchResult, addRenderingLayer } from "./types";
export { Client } from "./types/collaborative/session";
export {
  ClientJoinedMessage,
  ClientLeftMessage,
  ClientMovedMessage,
  CollaborationMessage,
  RemoteRevisionMessage,
  RevisionRedoneMessage,
  RevisionUndoneMessage,
  TransportService,
} from "./types/collaborative/transport_service";
export {
  coreTypes,
  invalidateCFEvaluationCommands,
  invalidateDependenciesCommands,
  invalidateEvaluationCommands,
  readonlyAllowedCommands,
} from "./types/commands";
export { CellErrorType, EvaluationError } from "./types/errors";

/**
 * We export here all entities that needs to be accessed publicly by Odoo.
 *
 * Note that the __info__ key is actually completed by the build process (see
 * the rollup.config.js file)
 */

export const __info__ = {};

export const SPREADSHEET_DIMENSIONS = {
  MIN_ROW_HEIGHT,
  MIN_COL_WIDTH,
  HEADER_HEIGHT,
  HEADER_WIDTH,
  TOPBAR_HEIGHT,
  BOTTOMBAR_HEIGHT,
  DEFAULT_CELL_WIDTH,
  DEFAULT_CELL_HEIGHT,
  SCROLLBAR_WIDTH,
};

export const registries = {
  autoCompleteProviders,
  autofillModifiersRegistry,
  autofillRulesRegistry,
  cellMenuRegistry,
  colMenuRegistry,
  errorTypes,
  linkMenuRegistry,
  functionRegistry,
  featurePluginRegistry,
  statefulUIPluginRegistry,
  coreViewsPluginRegistry,
  corePluginRegistry,
  rowMenuRegistry,
  sidePanelRegistry,
  figureRegistry,
  chartSidePanelComponentRegistry,
  chartComponentRegistry,
  chartRegistry,
  topbarMenuRegistry,
  topbarComponentRegistry,
  clickableCellRegistry,
  otRegistry,
  inverseCommandRegistry,
  urlRegistry,
  cellPopoverRegistry,
  numberFormatMenuRegistry,
  repeatLocalCommandTransformRegistry,
  repeatCommandTransformRegistry,
  clipboardHandlersRegistries,
};
export const helpers = {
  arg,
  isEvaluationError,
  toBoolean,
  toJsDate,
  toNumber,
  toString,
  toXC,
  toZone,
  toUnboundedZone,
  toCartesian,
  numberToLetters,
  lettersToNumber,
  UuidGenerator,
  formatValue,
  createCurrencyFormat,
  computeTextWidth,
  createEmptyWorkbookData,
  createEmptySheet,
  createEmptyExcelSheet,
  getDefaultChartJsRuntime,
  chartFontColor,
  ChartColors,
  getFillingMode,
  rgbaToHex,
  colorToRGBA,
  positionToZone,
  isDefined,
  isMatrix,
  lazy,
  genericRepeat,
  createAction,
  createActions,
  transformRangeData,
  deepEquals,
  overlap,
  union,
  isInside,
  deepCopy,
  expandZoneOnInsertion,
  reduceZoneOnDeletion,
  unquote,
};

export const links = {
  isMarkdownLink,
  parseMarkdownLink,
  markdownLink,
  openLink,
  urlRepresentation,
};

export const components = {
  Checkbox,
  Section,
  ChartColor,
  ChartDataSeries,
  ChartErrorSection,
  ChartLabelRange,
  ChartTitle,
  ChartPanel,
  ChartFigure,
  ChartJsComponent,
  Grid,
  GridOverlay,
  ScorecardChart,
  LineConfigPanel,
  LineBarPieDesignPanel,
  BarConfigPanel,
  LineBarPieConfigPanel,
  GaugeChartConfigPanel,
  GaugeChartDesignPanel,
  ScorecardChartConfigPanel,
  ScorecardChartDesignPanel,
  FigureComponent,
  Menu,
  Popover,
  SelectionInput,
  ValidationMessages,
};

export const hooks = {
  useDragAndDropListItems,
  useHighlights,
  useHighlightsOnHover,
};

export const stores = {
  useStoreProvider,
  DependencyContainer,
  CellPopoverStore,
  ComposerFocusStore,
  ComposerStore,
  FindAndReplaceStore,
  HighlightStore,
  HoveredCellStore,
  ModelStore,
  NotificationStore,
  RendererStore,
  SelectionInputStore,
  SpreadsheetStore,
  useStore,
  useLocalStore,
  SidePanelStore,
};

export type { StoreConstructor, StoreParams } from "./store_engine";

export function addFunction(functionName: string, functionDescription: AddFunctionDescription) {
  functionRegistry.add(functionName, functionDescription);
  return {
    addFunction: (fName: string, fDescription: AddFunctionDescription) =>
      addFunction(fName, fDescription),
  };
}

export const constants = {
  DEFAULT_LOCALE,
  HIGHLIGHT_COLOR,
};

export type { EnrichedToken } from "./formulas/composer_tokenizer";
export type { AST, ASTFuncall } from "./formulas/parser";
export type { Token } from "./formulas/tokenizer";
export type * from "./types";
export type { FunctionRegistry };

export { AbstractCellClipboardHandler } from "./clipboard_handlers/abstract_cell_clipboard_handler";
export { AbstractFigureClipboardHandler } from "./clipboard_handlers/abstract_figure_clipboard_handler";
