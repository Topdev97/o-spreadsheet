import { BACKGROUND_CHART_COLOR } from "../../src/constants";
import { lettersToNumber, toCartesian, toZone } from "../../src/helpers/index";
import { Model } from "../../src/model";
import {
  BorderCommand,
  ChartUIDefinition,
  ChartUIDefinitionUpdate,
  CreateSheetCommand,
  DispatchResult,
  SortDirection,
  UID,
} from "../../src/types";
import { target } from "./helpers";

/**
 * Dispatch an UNDO to the model
 */
export function undo(model: Model): DispatchResult {
  return model.dispatch("REQUEST_UNDO");
}

/**
 * Dispatch a REDO to the model
 */
export function redo(model: Model): DispatchResult {
  return model.dispatch("REQUEST_REDO");
}

export function activateSheet(
  model: Model,
  sheetIdTo: UID,
  sheetIdFrom: UID = model.getters.getActiveSheetId()
) {
  return model.dispatch("ACTIVATE_SHEET", { sheetIdFrom, sheetIdTo });
}

/**
 * Create a new sheet. By default, the sheet is added at position 1
 * If data.activate is true, a "ACTIVATE_SHEET" is dispatched
 */
export function createSheet(
  model: Model,
  data: Partial<CreateSheetCommand & { activate: boolean }>
) {
  const sheetId = data.sheetId || model.uuidGenerator.uuidv4();
  const result = model.dispatch("CREATE_SHEET", {
    position: data.position !== undefined ? data.position : 1,
    sheetId,
    cols: data.cols,
    rows: data.rows,
    name: data.name,
  });
  if (data.activate) {
    activateSheet(model, sheetId);
  }
  return result;
}

export function renameSheet(model: Model, sheetId: UID, name: string): DispatchResult {
  return model.dispatch("RENAME_SHEET", { sheetId, name });
}

export function createSheetWithName(
  model: Model,
  data: Partial<CreateSheetCommand & { activate: boolean }>,
  name: string
): DispatchResult {
  let createResult = createSheet(model, data);
  if (!createResult.isSuccessful) {
    return createResult;
  }
  const sheets = model.getters.getSheets();
  return renameSheet(model, sheets[sheets.length - 1].id, name);
}

export function deleteSheet(model: Model, sheetId: UID): DispatchResult {
  return model.dispatch("DELETE_SHEET", { sheetId });
}

/**
 * Create a new chart by default of type bar with titles
 * in the data sets, on the active sheet.
 */
export function createChart(
  model: Model,
  data: Partial<ChartUIDefinition>,
  chartId?: UID,
  sheetId?: UID
) {
  const id = chartId || model.uuidGenerator.uuidv4();
  sheetId = sheetId || model.getters.getActiveSheetId();

  return model.dispatch("CREATE_CHART", {
    id,
    sheetId,
    definition: {
      title: data.title || "test",
      dataSets: data.dataSets || [],
      dataSetsHaveTitle: data.dataSetsHaveTitle !== undefined ? data.dataSetsHaveTitle : true,
      labelRange: data.labelRange,
      type: data.type || "bar",
      background: data.background || BACKGROUND_CHART_COLOR,
      verticalAxisPosition: data.verticalAxisPosition || "left",
      legendPosition: data.legendPosition || "top",
      stackedBar: data.stackedBar || false,
    },
  });
}

/**
 * Update a chart
 */
export function updateChart(
  model: Model,
  chartId: UID,
  definition: ChartUIDefinitionUpdate,
  sheetId: UID = model.getters.getActiveSheetId()
): DispatchResult {
  return model.dispatch("UPDATE_CHART", {
    id: chartId,
    sheetId,
    definition,
  });
}

/**
 * Add columns
 */
export function addColumns(
  model: Model,
  position: "before" | "after",
  column: string,
  quantity: number,
  sheetId: UID = model.getters.getActiveSheetId()
): DispatchResult {
  return model.dispatch("ADD_COLUMNS_ROWS", {
    sheetId,
    dimension: "COL",
    position,
    base: lettersToNumber(column),
    quantity,
  });
}

/**
 * Delete columns
 */
export function deleteColumns(
  model: Model,
  columns: string[],
  sheetId: UID = model.getters.getActiveSheetId()
): DispatchResult {
  return model.dispatch("REMOVE_COLUMNS_ROWS", {
    sheetId,
    dimension: "COL",
    elements: columns.map(lettersToNumber),
  });
}

/**
 * Resize columns
 */
export function resizeColumns(
  model: Model,
  columns: string[],
  size: number,
  sheetId: UID = model.getters.getActiveSheetId()
): DispatchResult {
  return model.dispatch("RESIZE_COLUMNS_ROWS", {
    dimension: "COL",
    elements: columns.map(lettersToNumber),
    sheetId,
    size,
  });
}

/**
 * Add rows
 */
export function addRows(
  model: Model,
  position: "before" | "after",
  row: number,
  quantity: number,
  sheetId: UID = model.getters.getActiveSheetId()
): DispatchResult {
  return model.dispatch("ADD_COLUMNS_ROWS", {
    dimension: "ROW",
    sheetId,
    position,
    base: row,
    quantity,
  });
}

/**
 * Delete rows
 */
export function deleteRows(
  model: Model,
  rows: number[],
  sheetId: UID = model.getters.getActiveSheetId()
): DispatchResult {
  return model.dispatch("REMOVE_COLUMNS_ROWS", {
    sheetId,
    elements: rows,
    dimension: "ROW",
  });
}

/**
 * Resize rows
 */
export function resizeRows(
  model: Model,
  rows: number[],
  size: number,
  sheetId: UID = model.getters.getActiveSheetId()
): DispatchResult {
  return model.dispatch("RESIZE_COLUMNS_ROWS", {
    dimension: "ROW",
    elements: rows,
    sheetId,
    size,
  });
}

/**
 * Hide Columns
 */
export function hideColumns(
  model: Model,
  columns: string[],
  sheetId: UID = model.getters.getActiveSheetId()
): DispatchResult {
  return model.dispatch("HIDE_COLUMNS_ROWS", {
    sheetId,
    dimension: "COL",
    elements: columns.map(lettersToNumber),
  });
}

/**
 * Unhide Columns
 */
export function unhideColumns(
  model: Model,
  columns: string[],
  sheetId: UID = model.getters.getActiveSheetId()
): DispatchResult {
  return model.dispatch("UNHIDE_COLUMNS_ROWS", {
    sheetId,
    dimension: "COL",
    elements: columns.map(lettersToNumber),
  });
}

/**
 * Hide Rows
 */
export function hideRows(
  model: Model,
  rows: number[],
  sheetId: UID = model.getters.getActiveSheetId()
): DispatchResult {
  return model.dispatch("HIDE_COLUMNS_ROWS", {
    sheetId,
    dimension: "ROW",
    elements: rows,
  });
}

/**
 * Unhide Rows
 */
export function unhideRows(
  model: Model,
  rows: number[],
  sheetId: UID = model.getters.getActiveSheetId()
): DispatchResult {
  return model.dispatch("UNHIDE_COLUMNS_ROWS", {
    sheetId,
    dimension: "ROW",
    elements: rows,
  });
}

export function deleteCells(model: Model, range: string, shift: "left" | "up"): DispatchResult {
  return model.dispatch("DELETE_CELL", {
    zone: toZone(range),
    shiftDimension: shift === "left" ? "COL" : "ROW",
  });
}

export function insertCells(model: Model, range: string, shift: "right" | "down"): DispatchResult {
  return model.dispatch("INSERT_CELL", {
    zone: toZone(range),
    shiftDimension: shift === "right" ? "COL" : "ROW",
  });
}

/**
 * Set a border to a given zone or the selected zones
 */
export function setBorder(model: Model, border: BorderCommand, xc?: string) {
  const target = xc ? [toZone(xc)] : model.getters.getSelectedZones();
  model.dispatch("SET_FORMATTING", {
    sheetId: model.getters.getActiveSheetId(),
    target,
    border,
  });
}

/**
 * Clear a cell
 */
export function clearCell(
  model: Model,
  xc: string,
  sheetId: UID = model.getters.getActiveSheetId()
) {
  const [col, row] = toCartesian(xc);
  model.dispatch("CLEAR_CELL", { col, row, sheetId });
}

/**
 * Set the content of a cell
 */
export function setCellContent(
  model: Model,
  xc: string,
  content: string,
  sheetId: UID = model.getters.getActiveSheetId()
) {
  const [col, row] = toCartesian(xc);
  return model.dispatch("UPDATE_CELL", { col, row, sheetId, content });
}

/**
 * Select a cell
 */
export function selectCell(model: Model, xc: string): DispatchResult {
  const [col, row] = toCartesian(xc);
  return model.dispatch("SELECT_CELL", { col, row });
}

export function setSelection(
  model: Model,
  xcs: string[],
  options: {
    anchor?: string | undefined;
    strict?: boolean;
  } = { anchor: undefined, strict: false }
) {
  const zones = xcs.map(toZone);
  const cartesianAnchor: [number, number] = options.anchor
    ? toCartesian(options.anchor)
    : [zones[0].left, zones[0].top];
  model.dispatch("SET_SELECTION", {
    anchorZone: zones[zones.length - 1], // the default for most tests is to have the anchor as the last zone
    anchor: cartesianAnchor,
    zones: zones,
    strict: options.strict,
  });
}

export function sort(
  model: Model,
  {
    zone,
    sheetId,
    anchor,
    direction,
    interactive,
  }: {
    zone: string;
    sheetId?: UID;
    anchor: string;
    direction: SortDirection;
    interactive?: boolean;
  }
) {
  return model.dispatch("SORT_CELLS", {
    sheetId: sheetId || model.getters.getActiveSheetId(),
    zone: toZone(zone),
    anchor: toCartesian(anchor),
    sortDirection: direction,
    interactive,
  });
}

export function merge(
  model: Model,
  range: string,
  sheetId: UID = model.getters.getActiveSheetId()
): DispatchResult {
  return model.dispatch("ADD_MERGE", {
    sheetId,
    target: target(range),
    force: true,
  });
}

export function interactiveMerge(
  model: Model,
  range: string,
  sheetId: UID = model.getters.getActiveSheetId()
): DispatchResult {
  return model.dispatch("ADD_MERGE", {
    sheetId,
    target: target(range),
    force: false,
  });
}

export function unMerge(
  model: Model,
  range: string,
  sheetId: UID = model.getters.getActiveSheetId()
): DispatchResult {
  return model.dispatch("REMOVE_MERGE", {
    sheetId,
    target: target(range),
  });
}

export function snapshot(model: Model) {
  model["session"].snapshot(model.exportData());
}

export function moveColumns(
  model: Model,
  target: string,
  columns: string[],
  sheetId: UID = model.getters.getActiveSheetId()
): DispatchResult {
  return model.dispatch("MOVE_COLUMNS_ROWS", {
    sheetId,
    base: lettersToNumber(target),
    dimension: "COL",
    elements: columns.map(lettersToNumber),
  });
}

export function moveRows(
  model: Model,
  target: number,
  rows: number[],
  sheetId: UID = model.getters.getActiveSheetId()
): DispatchResult {
  return model.dispatch("MOVE_COLUMNS_ROWS", {
    sheetId,
    base: target,
    dimension: "ROW",
    elements: rows,
  });
}
