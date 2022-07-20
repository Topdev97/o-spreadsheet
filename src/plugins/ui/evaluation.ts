import { compile } from "../../formulas/index";
import { functionRegistry } from "../../functions/index";
import { intersection, isZoneValid, toXC, zoneToXc } from "../../helpers/index";
import { ModelConfig } from "../../model";
import { SelectionStreamProcessor } from "../../selection_stream/selection_stream_processor";
import { StateObserver } from "../../state_observer";
import { _lt } from "../../translation";
import {
  CellErrorLevel,
  CellErrorType,
  CircularDependencyError,
  EvaluationError,
  InvalidReferenceError,
} from "../../types/errors";
import {
  Cell,
  CellValue,
  CellValueType,
  Command,
  CommandDispatcher,
  EnsureRange,
  EvalContext,
  Format,
  FormattedValue,
  FormulaCell,
  Getters,
  invalidateEvaluationCommands,
  MatrixArg,
  PrimitiveArg,
  Range,
  ReferenceDenormalizer,
  UID,
} from "../../types/index";
import { UIPlugin } from "../ui_plugin";

const functionMap = functionRegistry.mapping;

type CompilationParameters = [ReferenceDenormalizer, EnsureRange, EvalContext];

export class EvaluationPlugin extends UIPlugin {
  static getters = ["evaluateFormula", "getRangeFormattedValues", "getRangeValues"] as const;

  private isUpToDate: Set<UID> = new Set(); // Set<sheetIds>
  private readonly evalContext: EvalContext;

  constructor(
    getters: Getters,
    state: StateObserver,
    dispatch: CommandDispatcher["dispatch"],
    config: ModelConfig,
    selection: SelectionStreamProcessor
  ) {
    super(getters, state, dispatch, config, selection);
    this.evalContext = config.evalContext;
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
        if ("content" in cmd || "format" in cmd) {
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
    const compiledFormula = compile(formulaString);
    const params = this.getCompilationParameters(() => {});

    const ranges: Range[] = [];
    for (let xc of compiledFormula.dependencies) {
      ranges.push(this.getters.getRangeFromSheetXC(sheetId, xc));
    }
    return compiledFormula.execute(ranges, ...params).value;
  }

  /**
   * Return the value of each cell in the range as they are displayed in the grid.
   */
  getRangeFormattedValues(range: Range): FormattedValue[] {
    const sheet = this.getters.tryGetSheet(range.sheetId);
    if (sheet === undefined) return [];
    return this.getters
      .getCellsInZone(sheet.id, range.zone)
      .map((cell) => cell?.formattedValue || "");
  }

  /**
   * Return the value of each cell in the range.
   */
  getRangeValues(range: Range): (CellValue | undefined)[] {
    const sheet = this.getters.tryGetSheet(range.sheetId);
    if (sheet === undefined) return [];
    return this.getters.getCellsInZone(sheet.id, range.zone).map((cell) => cell?.evaluated.value);
  }

  // ---------------------------------------------------------------------------
  // Evaluator
  // ---------------------------------------------------------------------------

  private evaluate(sheetId: UID) {
    const cells = this.getters.getCells(sheetId);
    const compilationParameters = this.getCompilationParameters(computeCell);
    const visited: { [cellId: string]: boolean | null } = {};

    for (let cell of Object.values(cells)) {
      computeCell(cell);
    }

    function handleError(e: Error | any, cell: FormulaCell) {
      if (!(e instanceof Error)) {
        e = new Error(e);
      }
      const msg = e?.errorType || CellErrorType.GenericError;
      // apply function name
      const __lastFnCalled = compilationParameters[2].__lastFnCalled || "";
      cell.assignError(
        msg,
        new EvaluationError(
          msg,
          e.message.replace("[[FUNCTION_NAME]]", __lastFnCalled),
          e.logLevel !== undefined ? e.logLevel : CellErrorLevel.error
        )
      );
    }

    function computeCell(cell: Cell) {
      if (!cell.isFormula()) {
        return;
      }
      const cellId = cell.id;
      if (cellId in visited) {
        if (visited[cellId] === null) {
          cell.assignError(CellErrorType.CircularDependency, new CircularDependencyError());
        }
        return;
      }
      visited[cellId] = null;
      try {
        compilationParameters[2].__originCellXC = () => {
          // compute the value lazily for performance reasons
          const position = compilationParameters[2].getters.getCellPosition(cellId);
          return toXC(position.col, position.row);
        };

        const computedCell = cell.compiledFormula.execute(
          cell.dependencies,
          ...compilationParameters
        );
        cell.assignEvaluation(computedCell.value, cell.format || computedCell.format);
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
  private getCompilationParameters(computeCell: (cell: Cell) => void): CompilationParameters {
    const evalContext = Object.assign(Object.create(functionMap), this.evalContext, {
      getters: this.getters,
    });
    const getters = this.getters;

    function readCell(range: Range): PrimitiveArg {
      let cell: Cell | undefined;
      if (!getters.tryGetSheet(range.sheetId)) {
        throw new Error(_lt("Invalid sheet name"));
      }
      cell = getters.getCell(range.sheetId, range.zone.left, range.zone.top);
      if (!cell || cell.isEmpty()) {
        // magic "empty" value
        // Returning {value: null} instead of undefined will ensure that we don't
        // fall back on the default value of the argument provided to the formula's compute function
        return { value: null };
      }
      return getEvaluatedCell(cell);
    }

    function getEvaluatedCell(cell: Cell): { value: CellValue; format?: Format } {
      computeCell(cell);
      if (cell.evaluated.type === CellValueType.error) {
        throw new EvaluationError(
          cell.evaluated.value,
          cell.evaluated.error.message,
          cell.evaluated.error.logLevel
        );
      }
      return cell.evaluated;
    }

    /**
     * Return the values of the cell(s) used in reference, but always in the format of a range even
     * if a single cell is referenced. It is a list of col values. This is useful for the formulas that describe parameters as
     * range<number> etc.
     *
     * Note that each col is possibly sparse: it only contain the values of cells
     * that are actually present in the grid.
     */
    function range(range: Range): MatrixArg {
      const sheetId = range.sheetId;

      if (!isZoneValid(range.zone)) {
        throw new InvalidReferenceError();
      }

      // Performance issue: Avoid fetching data on positions that are out of the spreadsheet
      // e.g. A1:ZZZ9999 in a sheet with 10 cols and 10 rows should ignore everything past J10 and return a 10x10 array
      const sheetZone = {
        top: 0,
        bottom: getters.getNumberRows(sheetId) - 1,
        left: 0,
        right: getters.getNumberCols(sheetId) - 1,
      };
      const result: MatrixArg = [];

      const zone = intersection(range.zone, sheetZone);
      if (!zone) {
        result.push([]);
        return result;
      }

      // Performance issue: nested loop is faster than a map here
      for (let col = zone.left; col <= zone.right; col++) {
        const rowValues: ({ value: CellValue; format?: Format } | undefined)[] = [];
        for (let row = zone.top; row <= zone.bottom; row++) {
          const cell = evalContext.getters.getCell(range.sheetId, col, row);
          rowValues.push(cell ? getEvaluatedCell(cell) : undefined);
        }
        result.push(rowValues);
      }
      return result;
    }

    /**
     * Returns the value of the cell(s) used in reference
     *
     * @param range the references used
     * @param isMeta if a reference is supposed to be used in a `meta` parameter as described in the
     *        function for which this parameter is used, we just return the string of the parameter.
     *        The `compute` of the formula's function must process it completely
     */
    function refFn(
      range: Range,
      isMeta: boolean,
      functionName: string,
      paramNumber?: number
    ): PrimitiveArg {
      if (isMeta) {
        // Use zoneToXc of zone instead of getRangeString to avoid sending unbounded ranges
        return { value: zoneToXc(range.zone) };
      }

      if (!isZoneValid(range.zone)) {
        throw new InvalidReferenceError();
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
    return [refFn, range, evalContext];
  }

  /**
   * Triggers an evaluation of all cells on all sheets.
   */
  private evaluateAllSheets() {
    for (const sheetId of this.getters.getSheetIds()) {
      this.evaluate(sheetId);
      this.isUpToDate.add(sheetId);
    }
  }
}
