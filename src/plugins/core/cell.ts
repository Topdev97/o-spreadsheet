import { NULL_FORMAT } from "../../constants";
import { cellFactory } from "../../helpers/cells/cell_factory";
import { isInside, range, toCartesian, toXC } from "../../helpers/index";
import { getItemId } from "../../helpers/misc";
import {
  AddColumnsRowsCommand,
  ApplyRangeChange,
  Cell,
  CellData,
  CellValueType,
  CommandResult,
  CompiledFormula,
  CoreCommand,
  ExcelWorkbookData,
  FormulaCell,
  Range,
  RangePart,
  Sheet,
  Style,
  UID,
  UpdateCellData,
  WorkbookData,
  Zone,
} from "../../types/index";
import { CorePlugin } from "../core_plugin";

const nbspRegexp = new RegExp(String.fromCharCode(160), "g");

interface CoreState {
  // this.cells[sheetId][cellId] --> cell|undefined
  cells: Record<UID, Record<UID, Cell | undefined>>;
}

/**
 * Core Plugin
 *
 * This is the most fundamental of all plugins. It defines how to interact with
 * cell and sheet content.
 */
export class CellPlugin extends CorePlugin<CoreState> implements CoreState {
  static getters = [
    "zoneToXC",
    "getCells",
    "getFormulaCellContent",
    "inferFormulaFormat",
    "getCellStyle",
    "buildFormulaContent",
    "getCellById",
  ] as const;

  public readonly cells: { [sheetId: string]: { [id: string]: Cell } } = {};
  private createCell = cellFactory(this.getters);

  adaptRanges(applyChange: ApplyRangeChange, sheetId?: UID) {
    for (const sheet of Object.keys(this.cells)) {
      for (const cell of Object.values(this.cells[sheet] || {})) {
        if (cell.isFormula()) {
          for (const range of cell.dependencies) {
            if (!sheetId || range.sheetId === sheetId) {
              const change = applyChange(range);
              if (change.changeType !== "NONE") {
                this.history.update(
                  "cells",
                  sheet,
                  cell.id,
                  "dependencies" as any,
                  cell.dependencies.indexOf(range),
                  change.range
                );
              }
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Command Handling
  // ---------------------------------------------------------------------------

  allowDispatch(cmd: CoreCommand): CommandResult {
    switch (cmd.type) {
      case "UPDATE_CELL":
      case "CLEAR_CELL":
        return this.checkCellOutOfSheet(cmd.sheetId, cmd.col, cmd.row);
      default:
        return CommandResult.Success;
    }
  }

  handle(cmd: CoreCommand) {
    switch (cmd.type) {
      case "SET_FORMATTING":
        if ("style" in cmd) {
          this.setStyle(cmd.sheetId, cmd.target, cmd.style);
        }
        if ("format" in cmd && cmd.format !== undefined) {
          this.setFormatter(cmd.sheetId, cmd.target, cmd.format);
        }
        break;
      case "CLEAR_FORMATTING":
        this.clearStyles(cmd.sheetId, cmd.target);
        break;
      case "ADD_COLUMNS_ROWS":
        if (cmd.dimension === "COL") {
          this.handleAddColumnsRows(cmd, this.copyColumnStyle.bind(this));
        } else {
          this.handleAddColumnsRows(cmd, this.copyRowStyle.bind(this));
        }
        break;
      case "UPDATE_CELL":
        this.updateCell(this.getters.getSheet(cmd.sheetId), cmd.col, cmd.row, cmd);
        break;

      case "CLEAR_CELL":
        this.dispatch("UPDATE_CELL", {
          sheetId: cmd.sheetId,
          col: cmd.col,
          row: cmd.row,
          content: "",
          style: null,
          format: "",
        });
        break;
    }
  }

  /**
   * Set a format to all the cells in a zone
   */
  private setFormatter(sheetId: UID, zones: Zone[], format: string) {
    for (let zone of zones) {
      for (let row = zone.top; row <= zone.bottom; row++) {
        for (let col = zone.left; col <= zone.right; col++) {
          this.dispatch("UPDATE_CELL", {
            sheetId,
            col,
            row,
            format,
          });
        }
      }
    }
  }

  /**
   * Clear the styles of zones
   */
  private clearStyles(sheetId: UID, zones: Zone[]) {
    for (let zone of zones) {
      for (let col = zone.left; col <= zone.right; col++) {
        for (let row = zone.top; row <= zone.bottom; row++) {
          // commandHelpers.updateCell(sheetId, col, row, { style: undefined});
          this.dispatch("UPDATE_CELL", {
            sheetId,
            col,
            row,
            style: null,
          });
        }
      }
    }
  }

  /**
   * Copy the style of the reference column/row to the new columns/rows.
   */
  private handleAddColumnsRows(
    cmd: AddColumnsRowsCommand,
    fn: (sheet: Sheet, styleRef: number, elements: number[]) => void
  ) {
    const sheet = this.getters.getSheet(cmd.sheetId);
    // The new elements have already been inserted in the sheet at this point.
    let insertedElements: number[];
    let styleReference: number;
    if (cmd.position === "before") {
      insertedElements = range(cmd.base, cmd.base + cmd.quantity);
      styleReference = cmd.base + cmd.quantity;
    } else {
      insertedElements = range(cmd.base + 1, cmd.base + cmd.quantity + 1);
      styleReference = cmd.base;
    }
    fn(sheet, styleReference, insertedElements);
  }

  // ---------------------------------------------------------------------------
  // Import/Export
  // ---------------------------------------------------------------------------

  import(data: WorkbookData) {
    for (let sheet of data.sheets) {
      const imported_sheet = this.getters.getSheet(sheet.id);
      // cells
      for (let xc in sheet.cells) {
        const cellData = sheet.cells[xc];
        const [col, row] = toCartesian(xc);
        if (cellData?.content || cellData?.format || cellData?.style) {
          const cell = this.importCell(imported_sheet, cellData, data.styles, data.formats);
          this.history.update("cells", sheet.id, cell.id, cell);
          this.dispatch("UPDATE_CELL_POSITION", {
            cellId: cell.id,
            col,
            row,
            sheetId: sheet.id,
          });
        }
      }
    }
  }

  export(data: WorkbookData) {
    const styles: { [styleId: number]: Style } = {};
    const formats: { [formatId: number]: string } = {};

    for (let _sheet of data.sheets) {
      const cells: { [key: string]: CellData } = {};
      const positions = Object.keys(this.cells[_sheet.id] || {})
        .map((cellId) => this.getters.getCellPosition(cellId))
        .sort((a, b) => (a.col === b.col ? a.row - b.row : a.col - b.col));
      for (const { col, row } of positions) {
        const cell = this.getters.getCell(_sheet.id, col, row)!;
        const xc = toXC(col, row);

        cells[xc] = {
          style: cell.style ? getItemId<Style>(cell.style, styles) : undefined,
          format: cell.format ? getItemId<string>(cell.format, formats) : undefined,
          content: cell.content,
        };
      }
      _sheet.cells = cells;
    }
    data.styles = styles;
    data.formats = formats;
  }

  importCell(
    sheet: Sheet,
    cellData: CellData,
    normalizedStyles: { [key: number]: Style },
    normalizedFormats: { [key: number]: string }
  ): Cell {
    const style = (cellData.style && normalizedStyles[cellData.style]) || undefined;
    const format = (cellData.format && normalizedFormats[cellData.format]) || undefined;
    const cellId = this.uuidGenerator.uuidv4();
    const properties = { format, style };
    return this.createCell(cellId, cellData?.content || "", properties, sheet.id);
  }

  exportForExcel(data: ExcelWorkbookData) {
    this.export(data);
    for (let sheet of data.sheets) {
      for (const xc in sheet.cells) {
        const [col, row] = toCartesian(xc);
        const cell = this.getters.getCell(sheet.id, col, row)!;
        const exportedCellData = sheet.cells[xc]!;
        exportedCellData.value = cell.evaluated.value;
        exportedCellData.isFormula = cell.isFormula();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // GETTERS
  // ---------------------------------------------------------------------------
  getCells(sheetId: UID): Record<UID, Cell> {
    return this.cells[sheetId] || {};
  }

  /**
   * get a cell by ID. Used in evaluation when evaluating an async cell, we need to be able to find it back after
   * starting an async evaluation even if it has been moved or re-allocated
   */
  getCellById(cellId: UID): Cell | undefined {
    // this must be as fast as possible
    const position = this.getters.getCellPosition(cellId);
    const sheet = this.cells[position.sheetId];
    return sheet[cellId];
  }

  /**
   * Try to infer the cell format based on the formula dependencies.
   * e.g. if the formula is `=A1` and A1 has a given format, the
   * same format will be used.
   */
  inferFormulaFormat(compiledFormula: CompiledFormula, dependencies: Range[]): string | undefined {
    const dependenciesFormat = compiledFormula.dependenciesFormat;
    for (let dependencyFormat of dependenciesFormat) {
      switch (typeof dependencyFormat) {
        case "string":
          // dependencyFormat corresponds to a literal format which can be applied
          // directly.
          return dependencyFormat;
        case "number":
          // dependencyFormat corresponds to a dependency cell from which we must
          // find the cell and extract the associated format
          const ref = dependencies[dependencyFormat];
          if (this.getters.tryGetSheet(ref.sheetId)) {
            // if the reference is a range --> the first cell in the range
            // determines the format
            const cellRef = this.getters.getCell(ref.sheetId, ref.zone.left, ref.zone.top);
            if (cellRef && cellRef.format) {
              return cellRef.format;
            }
          }
      }
    }
    return NULL_FORMAT;
  }
  /*
   * Reconstructs the original formula string based on a normalized form and its dependencies
   */
  buildFormulaContent(sheetId: UID, cell: FormulaCell, dependencies?: Range[]): string {
    const ranges = dependencies || [...cell.dependencies];
    return cell.compiledFormula.tokens
      .map((token) => {
        if (token.type === "REFERENCE") {
          const range = ranges.shift()!;
          return this.getters.getRangeString(range, sheetId);
        }
        return token.value;
      })
      .join("");
  }

  getFormulaCellContent(sheetId: UID, cell: FormulaCell): string {
    return this.buildFormulaContent(sheetId, cell);
  }

  getCellStyle(cell?: Cell): Style {
    return (cell && cell.style) || {};
  }

  /**
   * Converts a zone to a XC coordinate system
   *
   * The conversion also treats merges as one single cell
   *
   * Examples:
   * {top:0,left:0,right:0,bottom:0} ==> A1
   * {top:0,left:0,right:1,bottom:1} ==> A1:B2
   *
   * if A1:B2 is a merge:
   * {top:0,left:0,right:1,bottom:1} ==> A1
   * {top:1,left:0,right:1,bottom:2} ==> A1:B3
   *
   * if A1:B2 and A4:B5 are merges:
   * {top:1,left:0,right:1,bottom:3} ==> A1:A5
   */
  zoneToXC(
    sheetId: UID,
    zone: Zone,
    fixedParts: RangePart[] = [{ colFixed: false, rowFixed: false }]
  ): string {
    zone = this.getters.expandZone(sheetId, zone);
    const topLeft = toXC(zone.left, zone.top, fixedParts[0]);
    const botRight = toXC(
      zone.right,
      zone.bottom,
      fixedParts.length > 1 ? fixedParts[1] : fixedParts[0]
    );
    const cellTopLeft = this.getters.getMainCell(sheetId, zone.left, zone.top);
    const cellBotRight = this.getters.getMainCell(sheetId, zone.right, zone.bottom);
    const sameCell = cellTopLeft[0] == cellBotRight[0] && cellTopLeft[1] == cellBotRight[1];
    if (topLeft != botRight && !sameCell) {
      return topLeft + ":" + botRight;
    }

    return topLeft;
  }

  private setStyle(sheetId: UID, target: Zone[], style: Style | undefined) {
    for (let zone of target) {
      for (let col = zone.left; col <= zone.right; col++) {
        for (let row = zone.top; row <= zone.bottom; row++) {
          const cell = this.getters.getCell(sheetId, col, row);
          this.dispatch("UPDATE_CELL", {
            sheetId,
            col,
            row,
            style: style ? { ...cell?.style, ...style } : undefined,
          });
        }
      }
    }
  }

  /**
   * Copy the style of one column to other columns.
   */
  private copyColumnStyle(sheet: Sheet, refColumn: number, targetCols: number[]) {
    for (let row = 0; row < sheet.rows.length; row++) {
      const format = this.getFormat(sheet.id, refColumn, row);
      if (format.style || format.format) {
        for (let col of targetCols) {
          this.dispatch("UPDATE_CELL", { sheetId: sheet.id, col, row, ...format });
        }
      }
    }
  }

  /**
   * Copy the style of one row to other rows.
   */
  private copyRowStyle(sheet: Sheet, refRow: number, targetRows: number[]) {
    for (let col = 0; col < sheet.cols.length; col++) {
      const format = this.getFormat(sheet.id, col, refRow);
      if (format.style || format.format) {
        for (let row of targetRows) {
          this.dispatch("UPDATE_CELL", { sheetId: sheet.id, col, row, ...format });
        }
      }
    }
  }

  /**
   * gets the currently used style/border of a cell based on it's coordinates
   */
  private getFormat(sheetId: UID, col: number, row: number): { style?: Style; format?: string } {
    const format: { style?: Style; format?: string } = {};
    const [mainCol, mainRow] = this.getters.getMainCell(sheetId, col, row);
    const cell = this.getters.getCell(sheetId, mainCol, mainRow);
    if (cell) {
      if (cell.style) {
        format["style"] = cell.style;
      }
      if (cell.format) {
        format["format"] = cell.format;
      }
    }
    return format;
  }

  private updateCell(sheet: Sheet, col: number, row: number, after: UpdateCellData) {
    const before = this.getters.getCell(sheet.id, col, row);
    const hasContent = "content" in after || "formula" in after;

    // Compute the new cell properties
    const afterContent = hasContent
      ? after.content?.replace(nbspRegexp, "") || ""
      : before?.content || "";
    let style: Style | undefined;
    if (after.style !== undefined) {
      style = after.style || undefined;
    } else {
      style = before ? before.style : undefined;
    }
    let format = ("format" in after ? after.format : before && before.format) || NULL_FORMAT;

    /* Read the following IF as:
     * we need to remove the cell if it is completely empty, but we can know if it completely empty if:
     * - the command says the new content is empty and has no border/format/style
     * - the command has no content property, in this case
     *     - either there wasn't a cell at this place and the command says border/format/style is empty
     *     - or there was a cell at this place, but it's an empty cell and the command says border/format/style is empty
     *  */
    if (
      ((hasContent && !afterContent && !after.formula) ||
        (!hasContent && (!before || before.isEmpty()))) &&
      !style &&
      !format
    ) {
      if (before) {
        this.history.update("cells", sheet.id, before.id, undefined);
        this.dispatch("UPDATE_CELL_POSITION", {
          cellId: undefined,
          col,
          row,
          sheetId: sheet.id,
        });
      }
      return;
    }

    const cellId = before?.id || this.uuidGenerator.uuidv4();
    const didContentChange = hasContent;
    const properties = { format, style };
    const cell = this.createCell(cellId, afterContent, properties, sheet.id);
    if (before && !didContentChange && cell.isFormula()) {
      // content is not re-evaluated if the content did not change => reassign the value manually
      // TODO this plugin should not care about evaluation
      // and evaluation should not depend on implementation details here.
      // Task 2813749
      cell.assignValue(before.evaluated.value);
      if (before.evaluated.type === CellValueType.error) {
        cell.assignError(before.evaluated.value, before.evaluated.error);
      }
    }
    this.history.update("cells", sheet.id, cell.id, cell);
    this.dispatch("UPDATE_CELL_POSITION", { cellId: cell.id, col, row, sheetId: sheet.id });
  }

  private checkCellOutOfSheet(sheetId: UID, col: number, row: number): CommandResult {
    const sheet = this.getters.tryGetSheet(sheetId);
    if (!sheet) return CommandResult.InvalidSheetId;
    const sheetZone = {
      top: 0,
      left: 0,
      bottom: sheet.rows.length - 1,
      right: sheet.cols.length - 1,
    };
    return isInside(col, row, sheetZone) ? CommandResult.Success : CommandResult.TargetOutOfSheet;
  }
}
