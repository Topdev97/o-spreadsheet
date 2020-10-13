import { toXC } from "../helpers/index";
import { OTRegistry } from "../registries/ot_registry";
import {
  AddMergeCommand,
  AddRowsCommand,
  Getters,
  UpdateCellCommand,
  Command,
  AddColumnsCommand,
  RemoveRowsCommand,
  RemoveColumnsCommand,
  DuplicateSheetCommand,
  DeleteSheetCommand,
} from "../types";

export const registry = new OTRegistry();

registry
  .addTransformation(
    "UPDATE_CELL",
    "ADD_MERGE",
    (
      toTransform: UpdateCellCommand,
      executed: AddMergeCommand,
      getters: Getters
    ): UpdateCellCommand[] => {
      if (toTransform.sheetId !== executed.sheetId) {
        return [toTransform];
      }
      const xc = toXC(toTransform.col, toTransform.row);
      const xcMerge = toXC(executed.zone.top, executed.zone.left);
      if (xc === xcMerge || !getters.isInSameMerge(xc, xcMerge)) {
        return [toTransform];
      }
      return [];
    }
  )
  .addTransformation(
    "UPDATE_CELL",
    "ADD_ROWS",
    (toTransform: UpdateCellCommand, executed: AddRowsCommand): UpdateCellCommand[] => {
      if (toTransform.sheetId !== executed.sheetId) {
        return [toTransform];
      }
      const updatedRow = toTransform.row;
      const pivotRow = executed.row;
      if (updatedRow > pivotRow || (updatedRow === pivotRow && executed.position === "before")) {
        return [
          Object.assign({}, toTransform, {
            row: updatedRow + executed.quantity,
          }),
        ];
      }
      return [toTransform];
    }
  )
  .addTransformation(
    "UPDATE_CELL",
    "REMOVE_ROWS",
    (toTransform: UpdateCellCommand, executed: RemoveRowsCommand): UpdateCellCommand[] => {
      if (toTransform.sheetId !== executed.sheetId) {
        return [toTransform];
      }
      let row = toTransform.row;
      if (executed.rows.includes(row)) {
        return [];
      }
      for (let removedRow of executed.rows) {
        if (row >= removedRow) {
          row--;
        }
      }
      return [Object.assign({}, toTransform, { row })];
    }
  )
  .addTransformation(
    "UPDATE_CELL",
    "REMOVE_COLUMNS",
    (toTransform: UpdateCellCommand, executed: RemoveColumnsCommand): UpdateCellCommand[] => {
      if (toTransform.sheetId !== executed.sheetId) {
        return [toTransform];
      }
      let col = toTransform.col;
      if (executed.columns.includes(col)) {
        return [];
      }
      for (let removedColumn of executed.columns) {
        if (col >= removedColumn) {
          col--;
        }
      }
      return [Object.assign({}, toTransform, { col })];
    }
  )
  .addTransformation(
    "UPDATE_CELL",
    "ADD_COLUMNS",
    (toTransform: UpdateCellCommand, executed: AddColumnsCommand): UpdateCellCommand[] => {
      if (toTransform.sheetId !== executed.sheetId) {
        return [toTransform];
      }
      const updatedCol = toTransform.col;
      const pivotCol = executed.column;
      if (updatedCol > pivotCol || (updatedCol === pivotCol && executed.position === "before")) {
        return [
          Object.assign({}, toTransform, {
            col: updatedCol + executed.quantity,
          }),
        ];
      }
      return [toTransform];
    }
  )
  .addTransformation(
    "UPDATE_CELL",
    "DUPLICATE_SHEET",
    (toTransform: UpdateCellCommand, executed: DuplicateSheetCommand): UpdateCellCommand[] => {
      if (toTransform.sheetId !== executed.sheetIdFrom) {
        return [toTransform];
      }
      return [toTransform, Object.assign({}, toTransform, { sheetId: executed.sheetIdTo })];
    }
  )
  .addTransformation(
    "UPDATE_CELL",
    "DELETE_SHEET",
    (toTransform: UpdateCellCommand, executed: DeleteSheetCommand): UpdateCellCommand[] => {
      if (toTransform.sheetId !== executed.sheetId) {
        return [toTransform];
      }
      return [];
    }
  );

export function transform(toTransform: Command, executed: Command, getters: Getters): Command[] {
  const ot = registry.getTransformation(toTransform.type, executed.type);
  return ot ? ot(toTransform, executed, getters) : [toTransform];
}
