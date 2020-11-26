import { toZone } from "../../src/helpers";
import { transform } from "../../src/ot/ot";
import {
  ClearCellCommand,
  ClearFormattingCommand,
  DeleteContentCommand,
  RemoveRowsCommand,
  SetBorderCommand,
  SetDecimalCommand,
  SetFormattingCommand,
  UpdateCellCommand,
  UpdateCellPositionCommand,
} from "../../src/types";

describe("OT with REMOVE_ROWS", () => {
  const sheetId = "Sheet1";
  const removeRows: RemoveRowsCommand = {
    type: "REMOVE_ROWS",
    rows: [2, 5, 3],
    sheetId,
  };

  const updateCell: Omit<UpdateCellCommand, "row"> = {
    type: "UPDATE_CELL",
    sheetId,
    content: "test",
    col: 1,
  };
  const updateCellPosition: Omit<UpdateCellPositionCommand, "row"> = {
    type: "UPDATE_CELL_POSITION",
    cellId: "Id",
    sheetId,
    col: 1,
  };
  const clearCell: Omit<ClearCellCommand, "row"> = {
    type: "CLEAR_CELL",
    sheetId,
    col: 1,
  };
  const setBorder: Omit<SetBorderCommand, "row"> = {
    type: "SET_BORDER",
    sheetId,
    col: 1,
    border: { left: ["thin", "#000"] },
  };

  describe.each([updateCell, updateCellPosition, clearCell, setBorder])(
    "single cell commands",
    (cmd) => {
      test(`remove rows before ${cmd.type}`, () => {
        const command = { ...cmd, row: 10 };
        const result = transform(command, removeRows);
        expect(result).toEqual({ ...command, row: 7 });
      });
      test(`remove rows after ${cmd.type}`, () => {
        const command = { ...cmd, row: 1 };
        const result = transform(command, removeRows);
        expect(result).toEqual(command);
      });
      test(`remove rows before and after ${cmd.type}`, () => {
        const command = { ...cmd, row: 4 };
        const result = transform(command, removeRows);
        expect(result).toEqual({ ...command, row: 2 });
      });
      test(`${cmd.type} in removed rows`, () => {
        const command = { ...cmd, row: 2 };
        const result = transform(command, removeRows);
        expect(result).toBeUndefined();
      });
      test(`${cmd.type} and rows removed in different sheets`, () => {
        const command = { ...cmd, row: 10, sheetId: "42" };
        const result = transform(command, removeRows);
        expect(result).toEqual(command);
      });
    }
  );

  const deleteContent: Omit<DeleteContentCommand, "target"> = {
    type: "DELETE_CONTENT",
    sheetId,
  };

  const setFormatting: Omit<SetFormattingCommand, "target"> = {
    type: "SET_FORMATTING",
    sheetId,
    style: { fillColor: "#000000" },
  };

  const clearFormatting: Omit<ClearFormattingCommand, "target"> = {
    type: "CLEAR_FORMATTING",
    sheetId,
  };

  const setDecimal: Omit<SetDecimalCommand, "target"> = {
    type: "SET_DECIMAL",
    sheetId,
    step: 1,
  };

  describe.each([deleteContent, setFormatting, clearFormatting, setDecimal])(
    "target commands",
    (cmd) => {
      test(`remove rows before ${cmd.type}`, () => {
        const command = { ...cmd, target: [toZone("A1:C1")] };
        const result = transform(command, removeRows);
        expect(result).toEqual(command);
      });
      test(`remove rows after ${cmd.type}`, () => {
        const command = { ...cmd, target: [toZone("A12:B14")] };
        const result = transform(command, removeRows);
        expect(result).toEqual({ ...command, target: [toZone("A9:B11")] });
      });
      test(`remove rows before and after ${cmd.type}`, () => {
        const command = { ...cmd, target: [toZone("A5:B5")] };
        const result = transform(command, removeRows);
        expect(result).toEqual({ ...command, target: [toZone("A3:B3")] });
      });
      test(`${cmd.type} in removed rows`, () => {
        const command = { ...cmd, target: [toZone("A6:B7")] };
        const result = transform(command, removeRows);
        expect(result).toEqual({ ...command, target: [toZone("A4:B4")] });
      });
      test(`${cmd.type} and rows removed in different sheets`, () => {
        const command = { ...cmd, target: [toZone("A1:C6")], sheetId: "42" };
        const result = transform(command, removeRows);
        expect(result).toEqual(command);
      });
      test(`${cmd.type} with a target removed`, () => {
        const command = { ...cmd, target: [toZone("A3:B4")] };
        const result = transform(command, removeRows);
        expect(result).toBeUndefined();
      });
      test(`${cmd.type} with a target removed, but another valid`, () => {
        const command = { ...cmd, target: [toZone("A3:B4"), toZone("A1")] };
        const result = transform(command, removeRows);
        expect(result).toEqual({ ...command, target: [toZone("A1")] });
      });
    }
  );
});
