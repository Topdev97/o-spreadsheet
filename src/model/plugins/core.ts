import { DEFAULT_CELL_HEIGHT, DEFAULT_CELL_WIDTH } from "../../constants";
import { formatNumber, formatValue } from "../../formatters";
import { isEqual, numberToLetters, toXC, union } from "../../helpers";
import { BasePlugin } from "../base_plugin";
import { addCell, deleteCell } from "../core";
import { updateState } from "../history";
import { HeaderData, SheetData, WorkbookData } from "../import_export";
import { Cell, Col, GridCommand, Row, Sheet, Zone } from "../types";

/**
 * Core Plugin
 *
 * This is the most fundamental of all plugins. It defines how to interact with
 * cell and sheet content.
 */
export class CorePlugin extends BasePlugin {
  static getters = ["getCellText", "zoneToXC", "expandZone"];

  handle(cmd: GridCommand): GridCommand[] | void {
    switch (cmd.type) {
      case "ACTIVATE_SHEET":
        this.activateSheet(cmd.sheet);
        break;
      case "CREATE_SHEET":
        const sheet = this.createSheet();
        return [{ type: "ACTIVATE_SHEET", sheet }];
      case "DELETE":
        this.deleteContent(cmd.sheet, cmd.target);
        break;
      case "SET_VALUE":
        addCell(this.workbook, cmd.xc, { content: cmd.text });
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  getCellText(cell: Cell): string {
    if (cell.value === "") {
      return "";
    }
    if (cell.value === false) {
      return "FALSE";
    }
    if (cell.value === true) {
      return "TRUE";
    }
    if (cell.error) {
      return cell.value;
    }

    const value = cell.value || 0;
    if (cell.type === "text") {
      return value.toString();
    }
    if (cell.format) {
      return formatValue(cell.value, cell.format);
    }
    return formatNumber(value);
  }

  /**
   * Converts a zone to a XC coordinate system
   *
   * The conversion also treats merges a one single cell
   *
   * Examples:
   * {top:0,left:0,right:0,bottom:0} ==> A1
   * {top:0,left:0,right:1,bottom:1} ==> A1:B2
   *
   * if A1:B2 is a merge:
   * {top:0,left:0,right:1,bottom:1} ==> A1
   */
  zoneToXC(zone: Zone): string {
    const topLeft = toXC(zone.left, zone.top);
    const botRight = toXC(zone.right, zone.bottom);

    if (topLeft != botRight && !this.workbook.mergeCellMap[topLeft]) {
      return topLeft + ":" + botRight;
    }

    return topLeft;
  }

  /**
   * Add all necessary merge to the current selection to make it valid
   * Todo: move this to merge plugin
   */
  expandZone(zone: Zone): Zone {
    let { left, right, top, bottom } = zone;
    let result: Zone = { left, right, top, bottom };
    for (let i = left; i <= right; i++) {
      for (let j = top; j <= bottom; j++) {
        let mergeId = this.workbook.mergeCellMap[toXC(i, j)];
        if (mergeId) {
          result = union(this.workbook.merges[mergeId], result);
        }
      }
    }
    return isEqual(result, zone) ? result : this.expandZone(result);
  }

  // ---------------------------------------------------------------------------
  // Other
  // ---------------------------------------------------------------------------

  private activateSheet(name: string) {
    const sheet = this.workbook.sheets.find(s => s.name === name)!;
    updateState(this.workbook, ["activeSheet"], sheet);

    // setting up rows and columns
    updateState(this.workbook, ["rows"], sheet.rows);
    updateState(
      this.workbook,
      ["height"],
      this.workbook.rows[this.workbook.rows.length - 1].bottom + DEFAULT_CELL_HEIGHT + 5
    );
    updateState(this.workbook, ["cols"], sheet.cols);
    updateState(
      this.workbook,
      ["width"],
      this.workbook.cols[this.workbook.cols.length - 1].right + DEFAULT_CELL_WIDTH
    );

    // merges
    updateState(this.workbook, ["merges"], sheet.merges);
    updateState(this.workbook, ["mergeCellMap"], sheet.mergeCellMap);

    // cells
    updateState(this.workbook, ["cells"], sheet.cells);
  }

  private createSheet(): string {
    const sheet: Sheet = {
      name: `Sheet${this.workbook.sheets.length + 1}`,
      cells: {},
      colNumber: 26,
      rowNumber: 100,
      cols: createDefaultCols(26),
      rows: createDefaultRows(100),
      merges: {},
      mergeCellMap: {},
      conditionalFormats: []
    };
    const sheets = this.workbook.sheets.slice();
    sheets.push(sheet);
    updateState(this.workbook, ["sheets"], sheets);
    return sheet.name;
  }

  private deleteContent(sheet: string, zones: Zone[]) {
    // TODO: get cells from the actual sheet
    const cells = this.workbook.activeSheet.cells;
    for (let zone of zones) {
      for (let col = zone.left; col <= zone.right; col++) {
        for (let row = zone.top; row <= zone.bottom; row++) {
          const xc = toXC(col, row);
          if (xc in cells) {
            deleteCell(this.workbook, xc);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Import/Export
  // ---------------------------------------------------------------------------

  import(data: WorkbookData) {
    for (let sheet of data.sheets) {
      this.importSheet(sheet);
    }
    this.activateSheet(this.workbook.sheets[0].name);
  }

  importSheet(data: SheetData) {
    const name = data.name || `Sheet${this.workbook.sheets.length + 1}`;
    const sheet: Sheet = {
      name: name,
      cells: {},
      colNumber: data.colNumber,
      rowNumber: data.rowNumber,
      cols: createCols(data.cols || {}, data.colNumber),
      rows: createRows(data.rows || {}, data.rowNumber),
      merges: {},
      mergeCellMap: {},
      conditionalFormats: data.conditionalFormats || []
    };
    const sheets = this.workbook.sheets.slice();
    sheets.push(sheet);
    updateState(this.workbook, ["sheets"], sheets);
    // cells
    for (let xc in data.cells) {
      addCell(this.workbook, xc, data.cells[xc], { sheet: name });
      const cell = sheet.cells[xc];
      sheet.rows[cell.row].cells[cell.col] = cell;
    }
  }
}

function createDefaultCols(colNumber: number): Col[] {
  const cols: Col[] = [];
  let current = 0;
  for (let i = 0; i < colNumber; i++) {
    const size = DEFAULT_CELL_WIDTH;
    const col = {
      left: current,
      right: current + size,
      size: size,
      name: numberToLetters(i)
    };
    cols.push(col);
    current = col.right;
  }
  return cols;
}

function createDefaultRows(rowNumber: number): Row[] {
  const rows: Row[] = [];
  let current = 0;
  for (let i = 0; i < rowNumber; i++) {
    const size = DEFAULT_CELL_HEIGHT;
    const row = {
      top: current,
      bottom: current + size,
      size: size,
      name: String(i + 1),
      cells: {}
    };
    rows.push(row);
    current = row.bottom;
  }
  return rows;
}

function createCols(savedCols: { [key: number]: HeaderData }, colNumber: number): Col[] {
  const cols: Col[] = [];
  let current = 0;
  for (let i = 0; i < colNumber; i++) {
    const size = savedCols[i] ? savedCols[i].size || DEFAULT_CELL_WIDTH : DEFAULT_CELL_WIDTH;
    const col = {
      left: current,
      right: current + size,
      size: size,
      name: numberToLetters(i)
    };
    cols.push(col);
    current = col.right;
  }
  return cols;
}

function createRows(savedRows: { [key: number]: HeaderData }, rowNumber: number): Row[] {
  const rows: Row[] = [];
  let current = 0;
  for (let i = 0; i < rowNumber; i++) {
    const size = savedRows[i] ? savedRows[i].size || DEFAULT_CELL_HEIGHT : DEFAULT_CELL_HEIGHT;
    const row = {
      top: current,
      bottom: current + size,
      size: size,
      name: String(i + 1),
      cells: {}
    };
    rows.push(row);
    current = row.bottom;
  }
  return rows;
}
