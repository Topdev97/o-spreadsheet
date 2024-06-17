import { cellStyleToCss, cssPropertiesToCss } from "../../components/helpers";
import { SELECTION_BORDER_COLOR } from "../../constants";
import { SelectionStreamProcessor } from "../../selection_stream/selection_stream_processor";
import {
  CellPosition,
  ClipboardCell,
  CommandDispatcher,
  CommandResult,
  ConditionalFormat,
  DataValidationRule,
  Dimension,
  Getters,
  GridRenderingContext,
  HeaderIndex,
  UID,
  Zone,
} from "../../types";
import { ClipboardMIMEType, ClipboardOperation, ClipboardOptions } from "../../types/clipboard";
import { xmlEscape } from "../../xlsx/helpers/xml_helpers";
import { toXC } from "../coordinates";
import { formatValue } from "../format";
import { deepEquals, range } from "../misc";
import { UuidGenerator } from "../uuid";
import {
  createAdaptedZone,
  isInside,
  mergeOverlappingZones,
  positions,
  recomputeZones,
  union,
} from "../zones";
import { ClipboardCellsAbstractState } from "./clipboard_abstract_cell_state";

interface CopiedTable {
  zone: Zone;
  filtersValues: Array<string[]>;
}

/** State of the clipboard when copying/cutting cells */
export class ClipboardCellsState extends ClipboardCellsAbstractState {
  private readonly cells: ClipboardCell[][];
  private readonly copiedTables: CopiedTable[];
  private readonly zones: Zone[];
  private readonly uuidGenerator = new UuidGenerator();

  constructor(
    zones: Zone[],
    operation: ClipboardOperation,
    getters: Getters,
    dispatch: CommandDispatcher["dispatch"],
    selection: SelectionStreamProcessor
  ) {
    super(operation, getters, dispatch, selection);
    if (!zones.length) {
      this.cells = [[]];
      this.zones = [];
      this.copiedTables = [];
      return;
    }
    const lefts = new Set(zones.map((z) => z.left));
    const rights = new Set(zones.map((z) => z.right));
    const tops = new Set(zones.map((z) => z.top));
    const bottoms = new Set(zones.map((z) => z.bottom));

    const areZonesCompatible =
      (tops.size === 1 && bottoms.size === 1) || (lefts.size === 1 && rights.size === 1);

    // In order to don't paste several times the same cells in intersected zones
    // --> we merge zones that have common cells
    const clippedZones = areZonesCompatible
      ? mergeOverlappingZones(zones)
      : [zones[zones.length - 1]];

    const cellsPosition = clippedZones.map((zone) => positions(zone)).flat();
    const columnsIndex = [...new Set(cellsPosition.map((p) => p.col))].sort((a, b) => a - b);
    const rowsIndex = [...new Set(cellsPosition.map((p) => p.row))].sort((a, b) => a - b);

    const cellsInClipboard: ClipboardCell[][] = [];
    const sheetId = getters.getActiveSheetId();

    for (let row of rowsIndex) {
      let cellsInRow: ClipboardCell[] = [];
      for (let col of columnsIndex) {
        const position = { col, row, sheetId };
        const spreader = getters.getArrayFormulaSpreadingOn(position);
        let cell = getters.getCell(position);
        const evaluatedCell = getters.getEvaluatedCell(position);
        if (spreader) {
          const isSpreaderCopied =
            rowsIndex.includes(spreader.row) && columnsIndex.includes(spreader.col);
          const content = isSpreaderCopied
            ? ""
            : formatValue(evaluatedCell.value, { locale: getters.getLocale() });
          cell = {
            id: cell?.id || "",
            style: cell?.style,
            format: evaluatedCell.format,
            content,
            isFormula: false,
          };
        }
        cellsInRow.push({
          cell,
          border: getters.getCellBorder(position) || undefined,
          evaluatedCell,
          position,
        });
      }
      cellsInClipboard.push(cellsInRow);
    }

    const tables: CopiedTable[] = [];
    for (const zone of zones) {
      for (const table of this.getters.getFilterTablesInZone(sheetId, zone)) {
        const values: Array<string[]> = [];
        for (const col of range(table.zone.left, table.zone.right + 1)) {
          values.push(this.getters.getFilterValues({ sheetId, col, row: table.zone.top }));
        }
        tables.push({ filtersValues: values, zone: table.zone });
      }
    }

    this.cells = cellsInClipboard;
    this.zones = clippedZones;
    this.copiedTables = tables;
  }

  isCutAllowed(target: Zone[]): CommandResult {
    if (target.length !== 1) {
      return CommandResult.WrongCutSelection;
    }
    return CommandResult.Success;
  }

  isPasteAllowed(target: Zone[], clipboardOption?: ClipboardOptions): CommandResult {
    const sheetId = this.getters.getActiveSheetId();
    if (this.operation === "CUT" && clipboardOption?.pasteOption !== undefined) {
      // cannot paste only format or only value if the previous operation is a CUT
      return CommandResult.WrongPasteOption;
    }
    if (target.length > 1) {
      // cannot paste if we have a clipped zone larger than a cell and multiple
      // zones selected
      if (this.cells.length > 1 || this.cells[0].length > 1) {
        return CommandResult.WrongPasteSelection;
      }
    }

    const clipboardHeight = this.cells.length;
    const clipboardWidth = this.cells[0].length;
    for (let zone of this.getPasteZones(target)) {
      if (this.getters.doesIntersectMerge(sheetId, zone)) {
        if (
          target.length > 1 ||
          !this.getters.isSingleCellOrMerge(sheetId, target[0]) ||
          clipboardHeight * clipboardWidth !== 1
        ) {
          return CommandResult.WillRemoveExistingMerge;
        }
      }
    }
    const { xSplit, ySplit } = this.getters.getPaneDivisions(sheetId);
    for (const zone of this.getPasteZones(target)) {
      if (
        (zone.left < xSplit && zone.right >= xSplit) ||
        (zone.top < ySplit && zone.bottom >= ySplit)
      ) {
        return CommandResult.FrozenPaneOverlap;
      }
    }
    return CommandResult.Success;
  }

  /**
   * Paste the clipboard content in the given target
   */
  paste(target: Zone[], options?: ClipboardOptions | undefined) {
    if (this.operation === "COPY") {
      this.pasteFromCopy(target, options);
    } else {
      this.pasteFromCut(target, options);
    }
    const height = this.cells.length;
    const width = this.cells[0].length;
    const isCutOperation = this.operation === "CUT";
    if (options?.selectTarget) {
      this.selectPastedZone(width, height, isCutOperation, target);
    }
  }

  private pasteFromCopy(target: Zone[], options?: ClipboardOptions) {
    if (target.length === 1) {
      // in this specific case, due to the isPasteAllowed function:
      // state.cells can contains several cells.
      // So if the target zone is larger than the copied zone,
      // we duplicate each cells as many times as possible to fill the zone.
      const height = this.cells.length;
      const width = this.cells[0].length;
      const pasteZones = this.pastedZones(target, width, height);
      for (const zone of pasteZones) {
        this.pasteZone(zone.left, zone.top, options);
      }
    } else {
      // in this case, due to the isPasteAllowed function: state.cells contains
      // only one cell
      for (const zone of target) {
        for (let col = zone.left; col <= zone.right; col++) {
          for (let row = zone.top; row <= zone.bottom; row++) {
            this.pasteZone(col, row, options);
          }
        }
      }
    }
    if (options?.pasteOption === undefined) {
      this.pasteCopiedTables(target);
    }
  }

  private pasteFromCut(target: Zone[], options?: ClipboardOptions) {
    this.clearClippedZones();
    const selection = target[0];
    this.pasteZone(selection.left, selection.top, options);
    this.dispatch("MOVE_RANGES", {
      target: this.zones,
      sheetId: this.sheetId,
      targetSheetId: this.getters.getActiveSheetId(),
      col: selection.left,
      row: selection.top,
    });

    for (const filterTable of this.copiedTables) {
      this.dispatch("REMOVE_FILTER_TABLE", {
        sheetId: this.sheetId,
        target: [filterTable.zone],
      });
    }
    this.pasteCopiedTables(target);
  }

  /**
   * The clipped zone is copied as many times as it fits in the target.
   * This returns the list of zones where the clipped zone is copy-pasted.
   */
  private pastedZones(target: Zone[], originWidth: number, originHeight: number): Zone[] {
    const selection = target[0];
    const repeatHorizontally = Math.max(
      1,
      Math.floor((selection.right + 1 - selection.left) / originWidth)
    );
    const repeatVertically = Math.max(
      1,
      Math.floor((selection.bottom + 1 - selection.top) / originHeight)
    );
    const zones: Zone[] = [];
    for (let x = 0; x < repeatHorizontally; x++) {
      for (let y = 0; y < repeatVertically; y++) {
        const top = selection.top + y * originHeight;
        const left = selection.left + x * originWidth;
        zones.push({
          left,
          top,
          bottom: top + originHeight - 1,
          right: left + originWidth - 1,
        });
      }
    }
    return zones;
  }

  /**
   * Compute the complete zones where to paste the current clipboard
   */
  protected getPasteZones(target: Zone[]): Zone[] {
    const cells = this.cells;
    if (!cells.length || !cells[0].length) {
      return target;
    }
    const pasteZones: Zone[] = [];
    const height = cells.length;
    const width = cells[0].length;
    const selection = target[target.length - 1];

    const col = selection.left;
    const row = selection.top;
    const repetitionCol = Math.max(1, Math.floor((selection.right + 1 - col) / width));
    const repetitionRow = Math.max(1, Math.floor((selection.bottom + 1 - row) / height));

    for (let x = 1; x <= repetitionCol; x++) {
      for (let y = 1; y <= repetitionRow; y++) {
        pasteZones.push({
          left: col,
          top: row,
          right: col - 1 + x * width,
          bottom: row - 1 + y * height,
        });
      }
    }
    return pasteZones;
  }

  /**
   * Update the selection with the newly pasted zone
   */
  private selectPastedZone(width: number, height: number, isCutOperation: boolean, target: Zone[]) {
    const selection = target[0];
    const col = selection.left;
    const row = selection.top;
    if (height > 1 || width > 1 || isCutOperation) {
      const zones = this.pastedZones(target, width, height);
      const newZone = isCutOperation ? zones[0] : union(...zones);
      this.selection.selectZone({ cell: { col, row }, zone: newZone }, { scrollIntoView: false });
    }
  }

  /**
   * Clear the clipped zones: remove the cells and clear the formatting
   */
  private clearClippedZones() {
    this.dispatch("CLEAR_CELLS", {
      sheetId: this.sheetId,
      target: this.zones,
    });
    this.dispatch("CLEAR_FORMATTING", {
      sheetId: this.sheetId,
      target: this.zones,
    });
  }

  private pasteZone(col: HeaderIndex, row: HeaderIndex, clipboardOptions?: ClipboardOptions) {
    const height = this.cells.length;
    const width = this.cells[0].length;
    // This condition is used to determine if we have to paste the CF or not.
    // We have to do it when the command handled is "PASTE", not "INSERT_CELL"
    // or "DELETE_CELL". So, the state should be the local state

    const shouldPasteCF =
      clipboardOptions?.pasteOption !== "onlyValue" && clipboardOptions?.shouldPasteCF;
    const shouldPasteDV = !clipboardOptions?.pasteOption;

    const sheetId = this.getters.getActiveSheetId();
    // first, add missing cols/rows if needed
    this.addMissingDimensions(width, height, col, row);
    // then, perform the actual paste operation
    for (let r = 0; r < height; r++) {
      const rowCells = this.cells[r];
      for (let c = 0; c < width; c++) {
        const origin = rowCells[c];
        if (!origin) {
          continue;
        }
        const position = { col: col + c, row: row + r, sheetId: sheetId };
        // TODO: refactor this part. the "Paste merge" action is also executed with
        // MOVE_RANGES in pasteFromCut. Adding a condition on the operation type here
        // is not appropriate
        if (this.operation !== "CUT") {
          this.pasteMergeIfExist(origin.position, position);
        }
        this.pasteCell(origin, position, this.operation, clipboardOptions);
        if (shouldPasteCF) {
          this.pasteCf(origin.position, position);
        }
        if (shouldPasteDV) {
          this.pasteDataValidation(origin.position, position);
        }
      }
    }
  }

  /**
   * Paste the cell at the given position to the target position
   */
  private pasteCell(
    origin: ClipboardCell,
    target: CellPosition,
    operation: ClipboardOperation,
    clipboardOption?: ClipboardOptions
  ) {
    const { sheetId, col, row } = target;
    const targetCell = this.getters.getEvaluatedCell(target);

    if (clipboardOption?.pasteOption === "onlyValue") {
      const locale = this.getters.getLocale();
      const content = formatValue(origin.evaluatedCell.value, { locale });
      this.dispatch("UPDATE_CELL", { ...target, content });
      return;
    }

    const targetBorders = this.getters.getCellBorder(target);
    const originBorders = origin.border;
    const border = {
      top: targetBorders?.top || originBorders?.top,
      bottom: targetBorders?.bottom || originBorders?.bottom,
      left: targetBorders?.left || originBorders?.left,
      right: targetBorders?.right || originBorders?.right,
    };
    this.dispatch("SET_BORDER", { sheetId, col, row, border });

    if (clipboardOption?.pasteOption === "onlyFormat") {
      this.dispatch("UPDATE_CELL", {
        ...target,
        style: origin.cell?.style ?? null,
        format: origin.cell?.format ?? origin.evaluatedCell.format ?? targetCell.format,
      });
      return;
    }

    const content =
      origin.cell && origin.cell.isFormula && operation === "COPY"
        ? this.getters.getTranslatedCellFormula(
            sheetId,
            col - origin.position.col,
            row - origin.position.row,
            origin.cell.compiledFormula
          )
        : origin.cell?.content;
    if (content !== "" || origin.cell?.format || origin.cell?.style) {
      this.dispatch("UPDATE_CELL", {
        ...target,
        content,
        style: origin.cell?.style || null,
        format: origin.cell?.format,
      });
    } else if (targetCell) {
      this.dispatch("CLEAR_CELL", target);
    }
  }

  /**
   * If the origin position given is the top left of a merge, merge the target
   * position.
   */
  private pasteMergeIfExist(origin: CellPosition, target: CellPosition) {
    let { sheetId, col, row } = origin;

    const { col: mainCellColOrigin, row: mainCellRowOrigin } =
      this.getters.getMainCellPosition(origin);
    if (mainCellColOrigin === col && mainCellRowOrigin === row) {
      const merge = this.getters.getMerge(origin);
      if (!merge) {
        return;
      }
      ({ sheetId, col, row } = target);
      this.dispatch("ADD_MERGE", {
        sheetId,
        force: true,
        target: [
          {
            left: col,
            top: row,
            right: col + merge.right - merge.left,
            bottom: row + merge.bottom - merge.top,
          },
        ],
      });
    }
  }

  /** Paste the filter tables that are in the state */
  private pasteCopiedTables(target: Zone[]) {
    const sheetId = this.getters.getActiveSheetId();
    const selection = target[0];
    const cutZone = this.zones[0];
    const cutOffset: [number, number] = [
      selection.left - cutZone.left,
      selection.top - cutZone.top,
    ];
    for (const table of this.copiedTables) {
      const newTableZone = createAdaptedZone(table.zone, "both", "MOVE", cutOffset);
      this.dispatch("CREATE_FILTER_TABLE", { sheetId, target: [newTableZone] });
      for (const i of range(0, table.filtersValues.length)) {
        this.dispatch("UPDATE_FILTER", {
          sheetId,
          col: newTableZone.left + i,
          row: newTableZone.top,
          hiddenValues: table.filtersValues[i],
        });
      }
    }
  }

  getClipboardContent(): Record<string, string> {
    return {
      [ClipboardMIMEType.PlainText]: this.getPlainTextContent(),
      [ClipboardMIMEType.Html]: this.getHTMLContent(),
    };
  }

  private getPlainTextContent(): string {
    return (
      this.cells
        .map((cells) => {
          return cells
            .map((c) =>
              this.getters.shouldShowFormulas() && c?.cell?.isFormula
                ? c.cell?.content || ""
                : c?.evaluatedCell?.formattedValue || ""
            )
            .join("\t");
        })
        .join("\n") || "\t"
    );
  }

  private getHTMLContent(): string {
    if (this.cells.length === 1 && this.cells[0].length === 1) {
      if (!this.cells[0][0]) {
        return "";
      }
      return this.getters.getCellText(this.cells[0][0].position);
    }

    let htmlTable = '<table border="1" style="border-collapse:collapse">';
    for (const row of this.cells) {
      htmlTable += "<tr>";
      for (const cell of row) {
        if (!cell) {
          continue;
        }
        const cssStyle = cssPropertiesToCss(
          cellStyleToCss(this.getters.getCellComputedStyle(cell.position))
        );
        const cellText = this.getters.getCellText(cell.position);
        htmlTable += `<td style="${cssStyle}">` + xmlEscape(cellText) + "</td>";
      }
      htmlTable += "</tr>";
    }
    htmlTable += "</table>";
    return htmlTable;
  }

  isColRowDirtyingClipboard(position: HeaderIndex, dimension: Dimension): boolean {
    if (!this.zones) {
      return false;
    }
    for (let zone of this.zones) {
      if (dimension === "COL" && position <= zone.right) {
        return true;
      }
      if (dimension === "ROW" && position <= zone.bottom) {
        return true;
      }
    }
    return false;
  }

  drawClipboard(renderingContext: GridRenderingContext) {
    const { ctx, thinLineWidth } = renderingContext;
    if (this.sheetId !== this.getters.getActiveSheetId() || !this.zones || !this.zones.length) {
      return;
    }
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = SELECTION_BORDER_COLOR;
    ctx.lineWidth = 3.3 * thinLineWidth;
    for (const zone of this.zones) {
      const { x, y, width, height } = this.getters.getVisibleRect(zone);
      if (width > 0 && height > 0) {
        ctx.strokeRect(x, y, width, height);
      }
    }
  }

  private pasteCf(origin: CellPosition, target: CellPosition) {
    const xc = toXC(target.col, target.row);
    for (let rule of this.getters.getConditionalFormats(origin.sheetId)) {
      for (let range of rule.ranges) {
        if (
          isInside(
            origin.col,
            origin.row,
            this.getters.getRangeFromSheetXC(origin.sheetId, range).zone
          )
        ) {
          const cf = rule;
          const toRemoveRange: string[] = [];
          if (this.operation === "CUT") {
            //remove from current rule
            toRemoveRange.push(toXC(origin.col, origin.row));
          }
          if (origin.sheetId === target.sheetId) {
            this.adaptCFRules(origin.sheetId, cf, [xc], toRemoveRange);
          } else {
            this.adaptCFRules(origin.sheetId, cf, [], toRemoveRange);
            const cfToCopyTo = this.getCFToCopyTo(target.sheetId, cf);
            this.adaptCFRules(target.sheetId, cfToCopyTo, [xc], []);
          }
        }
      }
    }
  }

  /**
   * Add or remove cells to a given conditional formatting rule.
   */
  private adaptCFRules(sheetId: UID, cf: ConditionalFormat, toAdd: string[], toRemove: string[]) {
    const newRangesXC = this.getters.getAdaptedCfRanges(sheetId, cf, toAdd, toRemove);
    if (!newRangesXC) {
      return;
    }
    if (newRangesXC.length === 0) {
      this.dispatch("REMOVE_CONDITIONAL_FORMAT", { id: cf.id, sheetId });
      return;
    }
    this.dispatch("ADD_CONDITIONAL_FORMAT", {
      cf: {
        id: cf.id,
        rule: cf.rule,
        stopIfTrue: cf.stopIfTrue,
      },
      ranges: newRangesXC.map((xc) => this.getters.getRangeDataFromXc(sheetId, xc)),
      sheetId,
    });
  }

  private getCFToCopyTo(targetSheetId: UID, originCF: ConditionalFormat): ConditionalFormat {
    const cfInTarget = this.getters
      .getConditionalFormats(targetSheetId)
      .find((cf) => cf.stopIfTrue === originCF.stopIfTrue && deepEquals(cf.rule, originCF.rule));

    return cfInTarget ? cfInTarget : { ...originCF, id: this.uuidGenerator.uuidv4(), ranges: [] };
  }

  private pasteDataValidation(origin: CellPosition, target: CellPosition) {
    const rule = this.getters.getValidationRuleForCell(origin);
    if (!rule) {
      return;
    }
    const xc = toXC(target.col, target.row);
    for (const range of rule.ranges) {
      if (isInside(origin.col, origin.row, range.zone)) {
        const toRemoveRange: string[] = [];
        if (this.operation === "CUT") {
          toRemoveRange.push(toXC(origin.col, origin.row));
        }
        if (origin.sheetId === target.sheetId) {
          this.adaptDataValidationRule(origin.sheetId, rule, [xc], toRemoveRange);
        } else {
          this.adaptDataValidationRule(origin.sheetId, rule, [], toRemoveRange);
          let copyToRule = this.getDataValidationRuleToCopyTo(target.sheetId, rule);
          this.adaptDataValidationRule(target.sheetId, copyToRule, [xc], []);
        }
      }
    }
  }

  private getDataValidationRuleToCopyTo(
    targetSheetId: UID,
    originRule: DataValidationRule
  ): DataValidationRule {
    const ruleInTargetSheet = this.getters
      .getDataValidationRules(targetSheetId)
      .find(
        (rule) =>
          deepEquals(originRule.criterion, rule.criterion) &&
          originRule.isBlocking === rule.isBlocking
      );

    return ruleInTargetSheet
      ? ruleInTargetSheet
      : { ...originRule, id: this.uuidGenerator.uuidv4(), ranges: [] };
  }

  /**
   * Add or remove XCs to a given data validation rule.
   */
  private adaptDataValidationRule(
    sheetId: UID,
    rule: DataValidationRule,
    toAdd: string[],
    toRemove: string[]
  ) {
    const dvRangesXcs = rule.ranges.map((range) => this.getters.getRangeString(range, sheetId));
    const newRangesXC = recomputeZones([...dvRangesXcs, ...toAdd], toRemove);
    if (newRangesXC.length === 0) {
      this.dispatch("REMOVE_DATA_VALIDATION_RULE", { sheetId, id: rule.id });
      return;
    }
    this.dispatch("ADD_DATA_VALIDATION_RULE", {
      rule,
      ranges: newRangesXC.map((xc) => this.getters.getRangeDataFromXc(sheetId, xc)),
      sheetId,
    });
  }
}
