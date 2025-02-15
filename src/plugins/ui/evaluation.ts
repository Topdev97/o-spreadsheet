import { compile, normalize } from "../../formulas/index";
import { functionRegistry } from "../../functions/index";
import { intersection, isZoneValid, mapCellsInZone, toXC } from "../../helpers/index";
import { Mode, ModelConfig } from "../../model";
import { StateObserver } from "../../state_observer";
import { _lt } from "../../translation";
import {
  Cell,
  CellValue,
  CellValueType,
  Command,
  CommandDispatcher,
  EnsureRange,
  EvalContext,
  FormulaCell,
  Getters,
  invalidateEvaluationCommands,
  NormalizedFormula,
  Range,
  ReferenceDenormalizer,
  UID,
} from "../../types/index";
import { UIPlugin } from "../ui_plugin";

const functionMap = functionRegistry.mapping;

type FormulaParameters = [ReferenceDenormalizer, EnsureRange, EvalContext];

export class EvaluationPlugin extends UIPlugin {
  static getters = ["evaluateFormula", "getRangeFormattedValues", "getRangeValues"];
  static modes: Mode[] = ["normal"];

  private isUpToDate: Set<UID> = new Set(); // Set<sheetIds>
  private readonly evalContext: EvalContext;

  constructor(
    getters: Getters,
    state: StateObserver,
    dispatch: CommandDispatcher["dispatch"],
    config: ModelConfig
  ) {
    super(getters, state, dispatch, config);
    this.evalContext = config.evalContext;
    config.dataSources.on("data-loaded", this, () => {
      this.dispatch("EVALUATE_CELLS", { sheetId: this.getters.getActiveSheetId() });
    });
  }

  // ---------------------------------------------------------------------------
  // Command Handling
  // ---------------------------------------------------------------------------

  handle(cmd: Command) {
    if (invalidateEvaluationCommands.has(cmd.type)) {
      this.isUpToDate.clear();
    }
    switch (cmd.type) {
      case "UPDATE_CELL":
        if ("content" in cmd) {
          this.isUpToDate.clear();
        }
        break;
      case "ACTIVATE_SHEET": {
        this.evaluate(cmd.sheetIdTo);
        this.isUpToDate.add(cmd.sheetIdTo);
        break;
      }
      case "EVALUATE_CELLS":
        this.evaluate(cmd.sheetId);
        this.isUpToDate.add(cmd.sheetId);
        break;
      case "EVALUATE_ALL_SHEETS":
        this.evaluateAllSheets();
        break;
    }
  }

  finalize() {
    const sheetId = this.getters.getActiveSheetId();
    if (!this.isUpToDate.has(sheetId)) {
      this.evaluate(sheetId);
      this.isUpToDate.add(sheetId);
    }
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  evaluateFormula(formulaString: string, sheetId: UID = this.getters.getActiveSheetId()): any {
    let formula: NormalizedFormula = normalize(formulaString);
    const compiledFormula = compile(formula);
    const params = this.getFormulaParameters(() => {});

    const ranges: Range[] = [];
    for (let xc of formula.dependencies.references) {
      ranges.push(this.getters.getRangeFromSheetXC(sheetId, xc));
    }
    const dependencies = { ...formula.dependencies, references: ranges };
    return compiledFormula(dependencies, sheetId, ...params);
  }

  /**
   * Return the value of each cell in the range as they are displayed in the grid.
   */
  getRangeFormattedValues(range: Range): string[][] {
    const sheet = this.getters.tryGetSheet(range.sheetId);
    if (sheet === undefined) return [[]];
    return mapCellsInZone(
      range.zone,
      sheet,
      (cell) => this.getters.getCellText(cell, this.getters.shouldShowFormulas()),
      ""
    );
  }

  /**
   * Return the value of each cell in the range.
   */
  getRangeValues(range: Range): CellValue[][] {
    const sheet = this.getters.tryGetSheet(range.sheetId);
    if (sheet === undefined) return [[]];
    return mapCellsInZone(range.zone, sheet, (cell) => cell.evaluated.value);
  }

  // ---------------------------------------------------------------------------
  // Evaluator
  // ---------------------------------------------------------------------------

  private evaluate(sheetId: UID) {
    const cells = this.getters.getCells(sheetId);
    const params = this.getFormulaParameters(computeValue);
    const visited: { [cellId: string]: boolean | null } = {};

    for (let cell of Object.values(cells)) {
      computeValue(cell, sheetId);
    }

    function handleError(e: Error | any, cell: FormulaCell) {
      if (!(e instanceof Error)) {
        e = new Error(e);
      }
      if (cell.evaluated.value !== "#CYCLE") {
        cell.assignValue("#ERROR");

        // apply function name
        const __lastFnCalled = params[2].__lastFnCalled || "";
        cell.assignError("#ERROR", e.message.replace("[[FUNCTION_NAME]]", __lastFnCalled));
      }
    }

    function computeValue(cell: Cell, sheetId: string) {
      if (!cell.isFormula()) {
        return;
      }
      const cellId = cell.id;
      if (cellId in visited) {
        if (visited[cellId] === null) {
          cell.assignError("#CYCLE", _lt("Circular reference"));
        }
        return;
      }
      visited[cellId] = null;
      try {
        params[2].__originCellXC = () => {
          // compute the value lazily for performance reasons
          const position = params[2].getters.getCellPosition(cellId);
          return toXC(position.col, position.row);
        };
        cell.assignValue(cell.compiledFormula(cell.dependencies!, sheetId, ...params));
        if (Array.isArray(cell.evaluated.value)) {
          // if a value returns an array (like =A1:A3)
          throw new Error(_lt("This formula depends on invalid values"));
        }
      } catch (e) {
        handleError(e, cell);
      }
      visited[cellId] = true;
    }
  }

  /**
   * Return all functions necessary to properly evaluate a formula:
   * - a refFn function to read any reference, cell or range of a normalized formula
   * - a range function to convert any reference to a proper value array
   * - an evaluation context
   */
  private getFormulaParameters(computeValue: Function): FormulaParameters {
    const evalContext = Object.assign(Object.create(functionMap), this.evalContext, {
      getters: this.getters,
    });
    const sheets = this.getters.getEvaluationSheets();
    function readCell(range: Range): any {
      let cell: Cell | undefined;
      const s = sheets[range.sheetId];
      if (s) {
        cell = s.rows[range.zone.top]?.cells[range.zone.left];
      } else {
        throw new Error(_lt("Invalid sheet name"));
      }
      if (!cell || cell.isEmpty()) {
        // magic "empty" value
        // Returning null instead of undefined will ensure that we don't
        // fall back on the default value of the argument provided to the formula's compute function
        return null;
      }
      return getCellValue(cell, range.sheetId);
    }

    function getCellValue(cell: Cell, sheetId: UID): any {
      computeValue(cell, sheetId);
      if (cell.evaluated.type === CellValueType.error) {
        throw new Error(_lt("This formula depends on invalid values"));
      }
      return cell.evaluated.value;
    }

    /**
     * Return a range of values. It is a list of col values.
     *
     * Note that each col is possibly sparse: it only contain the values of cells
     * that are actually present in the grid.
     */
    function _range(range: Range): any[][] {
      const sheet = sheets[range.sheetId]!;

      if (!isZoneValid(range.zone)) {
        throw new Error(_lt("Invalid reference"));
      }

      // Performance issue: Avoid fetching data on positions that are out of the spreadsheet
      // e.g. A1:ZZZ9999 in a sheet with 10 cols and 10 rows should ignore everything past J10 and return a 10x10 array
      const sheetZone = {
        top: 0,
        bottom: sheet.rows.length - 1,
        left: 0,
        right: sheet.cols.length - 1,
      };
      const result: (CellValue | undefined)[][] = [];

      const zone = intersection(range.zone, sheetZone);
      if (!zone) {
        result.push([]);
        return result;
      }

      // Performance issue: nested loop is faster than a map here
      for (let col = zone.left; col <= zone.right; col++) {
        const rowValues: (CellValue | undefined)[] = [];
        for (let row = zone.top; row <= zone.bottom; row++) {
          const cell = evalContext.getters.getCell(range.sheetId, col, row);
          rowValues.push(cell ? getCellValue(cell, range.sheetId) : undefined);
        }
        result.push(rowValues);
      }
      return result;
    }

    /**
     * Returns the value of the cell(s) used in reference
     *
     * @param position the index in the references array
     * @param references all the references used in the current formula
     * @param sheetId the sheet that is currently being evaluated, if a reference does not
     *        include a sheet, it is the id of the sheet of the reference to be used
     * @param isMeta if a reference is supposed to be used in a `meta` parameter as described in the
     *        function for which this parameter is used, we just return the string of the parameter.
     *        The `compute` of the formula's function must process it completely
     */
    function refFn(
      position: number,
      references: Range[],
      sheetId: UID,
      isMeta: boolean,
      functionName: string,
      paramNumber?: number
    ): any | any[][] {
      const range: Range = references[position];

      if (isMeta) {
        return evalContext.getters.getRangeString(range, sheetId);
      }

      if (!isZoneValid(range.zone)) {
        throw new Error(_lt("Invalid reference"));
      }

      // if the formula definition could have accepted a range, we would pass through the _range function and not here
      if (range.zone.bottom !== range.zone.top || range.zone.left !== range.zone.right) {
        throw new Error(
          paramNumber
            ? _lt(
                "Function %s expects the parameter %s to be a single value or a single cell reference, not a range.",
                functionName.toString(),
                paramNumber.toString()
              )
            : _lt(
                "Function %s expects its parameters to be single values or single cell references, not ranges.",
                functionName.toString()
              )
        );
      }

      if (range.invalidSheetName) {
        throw new Error(_lt("Invalid sheet name: %s", range.invalidSheetName));
      }

      return readCell(range);
    }

    /**
     * Return the values of the cell(s) used in reference, but always in the format of a range even
     * if a single cell is referenced. This is useful for the formulas that describe parameters as
     * range<number> etc.
     *
     * the parameters are the same as refFn, except that these parameters cannot be Meta
     */
    function range(position: number, references: Range[], sheetId: UID): any[][] {
      return _range(references[position]);
    }

    return [refFn, range, evalContext];
  }

  /**
   * Triggers an evaluation of all cells on all sheets.
   */
  private evaluateAllSheets() {
    for (const sheetId of this.getters.getVisibleSheets()) {
      this.evaluate(sheetId);
      this.isUpToDate.add(sheetId);
    }
  }
}
