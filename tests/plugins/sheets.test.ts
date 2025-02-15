import { FORBIDDEN_SHEET_CHARS } from "../../src/constants";
import { getComposerSheetName, toCartesian, toZone } from "../../src/helpers";
import { Model } from "../../src/model";
import { CommandResult } from "../../src/types";
import {
  activateSheet,
  createChart,
  createSheet,
  createSheetWithName,
  deleteRows,
  hideRows,
  merge,
  redo,
  renameSheet,
  resizeColumns,
  resizeRows,
  setCellContent,
  undo,
  unMerge,
} from "../test_helpers/commands_helpers";
import { getCell, getCellContent, getCellText } from "../test_helpers/getters_helpers";
import "../test_helpers/helpers";
import { createEqualCF, testUndoRedo } from "../test_helpers/helpers";

jest.mock("../../src/helpers/uuid", () => require("../__mocks__/uuid"));

describe("sheets", () => {
  test("can create a new sheet, then undo, then redo", () => {
    const model = new Model();
    expect(model.getters.getVisibleSheets().length).toBe(1);
    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("Sheet1");

    createSheet(model, { activate: true, sheetId: "42" });
    expect(model.getters.getVisibleSheets().length).toBe(2);
    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("Sheet2");

    undo(model);
    expect(model.getters.getVisibleSheets().length).toBe(1);
    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("Sheet1");

    redo(model);
    expect(model.getters.getVisibleSheets().length).toBe(2);
    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("Sheet1");
  });

  test("Creating a new sheet insert it just after the active", () => {
    const model = new Model();
    createSheet(model, { sheetId: "42", position: 1 });
    createSheet(model, { sheetId: "43", position: 1 });
    expect(model.getters.getSheets()[1].id).toBe("43");
    expect(model.getters.getSheets()[2].id).toBe("42");
  });

  test("Creating a new sheet does not activate it by default", () => {
    const model = new Model();
    const sheet1 = model.getters.getVisibleSheets()[0];

    expect(model.getters.getActiveSheetId()).toBe(sheet1);
    expect(model.getters.getSheets().map((s) => s.id)).toEqual([sheet1]);
    createSheet(model, { sheetId: "42" });
    const sheet2 = model.getters.getVisibleSheets()[1];
    expect(model.getters.getActiveSheetId()).toBe(sheet1);
    expect(model.getters.getSheets().map((s) => s.id)).toEqual([sheet1, sheet2]);
  });

  test("Can create a new sheet with given size and name", () => {
    const model = new Model();
    createSheetWithName(
      model,
      {
        rows: 2,
        cols: 4,
        activate: true,
        sheetId: "42",
      },
      "SheetTest"
    );
    const activeSheet = model.getters.getActiveSheet();
    expect(activeSheet.cols.length).toBe(4);
    expect(activeSheet.rows.length).toBe(2);
    expect(activeSheet.name).toBe("SheetTest");
  });

  test("Cannot create a sheet with a name already existent", () => {
    const model = new Model();
    const name = model.getters.getSheetName(model.getters.getActiveSheetId()) || "";
    expect(
      createSheetWithName(
        model,
        {
          sheetId: "42",
          position: 1,
        },
        name
      )
    ).toBeCancelledBecause(CommandResult.DuplicatedSheetName);
  });

  test("Cannot create a sheet with a name already existent + upper", () => {
    const model = new Model();
    const name = model.getters.getSheetName(model.getters.getActiveSheetId()) || "";
    expect(
      createSheetWithName(
        model,
        {
          sheetId: "42",
          position: 1,
        },
        name.toUpperCase()
      )
    ).toBeCancelledBecause(CommandResult.DuplicatedSheetName);
  });
  test("Cannot create a sheet with a name already existent + spaces", () => {
    const model = new Model();
    const name = model.getters.getSheetName(model.getters.getActiveSheetId()) || "";
    expect(
      createSheetWithName(
        model,
        {
          sheetId: "42",
          position: 1,
        },
        "   " + name + "  "
      )
    ).toBeCancelledBecause(CommandResult.DuplicatedSheetName);
  });

  test.each(FORBIDDEN_SHEET_CHARS)("Cannot rename a sheet with a %s in the name", (char) => {
    const model = new Model();
    expect(
      renameSheet(model, model.getters.getActiveSheetId(), `my life ${char}`)
    ).toBeCancelledBecause(CommandResult.ForbiddenCharactersInSheetName);
  });

  test("Cannot create a sheet with a duplicate name", () => {
    const model = new Model({ sheets: [{ name: "My first sheet" }] });
    expect(createSheet(model, { sheetId: "42", name: "My first sheet" })).toBeCancelledBecause(
      CommandResult.DuplicatedSheetName
    );
  });

  test("Cannot create a sheet with a position > length of sheets", () => {
    const model = new Model();
    expect(model.dispatch("CREATE_SHEET", { sheetId: "42", position: 54 })).toBeCancelledBecause(
      CommandResult.WrongSheetPosition
    );
  });

  test("Cannot create a sheet with a negative position", () => {
    const model = new Model();
    expect(model.dispatch("CREATE_SHEET", { sheetId: "42", position: -1 })).toBeCancelledBecause(
      CommandResult.WrongSheetPosition
    );
  });

  test("Name is correctly generated when creating a sheet without given name", () => {
    const model = new Model();
    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("Sheet1");

    createSheet(model, { sheetId: "42", activate: true });
    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("Sheet2");
    createSheet(model, { sheetId: "43", activate: true });
    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("Sheet3");
    model.dispatch("DELETE_SHEET", { sheetId: "42" });
    expect(model.getters.getSheets()[0].name).toBe("Sheet1");
    expect(model.getters.getSheets()[1].name).toBe("Sheet3");
    createSheet(model, { sheetId: "44", activate: true });
    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("Sheet2");
  });

  test("Cannot delete an invalid sheet", async () => {
    const model = new Model();
    expect(model.dispatch("DELETE_SHEET", { sheetId: "invalid" })).toBeCancelledBecause(
      CommandResult.InvalidSheetId
    );
  });

  test("Cannot create a sheet with an already existent id", () => {
    const model = new Model();
    const sheetId = model.getters.getActiveSheetId();
    expect(
      createSheetWithName(
        model,
        {
          sheetId,
          position: 1,
        },
        "newSheet"
      )
    ).toBeCancelledBecause(CommandResult.DuplicatedSheetId);
  });

  test("Cannot delete an invalid sheet; confirmation", async () => {
    const model = new Model();
    expect(
      model.dispatch("DELETE_SHEET_CONFIRMATION", { sheetId: "invalid" })
    ).toBeCancelledBecause(CommandResult.InvalidSheetId);
  });

  test("can read a value in same sheet", () => {
    const model = new Model();
    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("Sheet1");

    setCellContent(model, "A1", "3");
    setCellContent(model, "A2", "=Sheet1!A1");

    expect(getCell(model, "A2")!.evaluated.value).toBe(3);
  });

  test("can read a value in another sheet", () => {
    const model = new Model();
    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("Sheet1");

    setCellContent(model, "A1", "3");
    createSheet(model, { sheetId: "42", activate: true });
    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("Sheet2");
    setCellContent(model, "A1", "=Sheet1!A1");
    expect(getCell(model, "A1")!.evaluated.value).toBe(3);
  });

  test("show #ERROR if invalid sheet name in content", () => {
    const model = new Model();
    setCellContent(model, "A1", "=Sheet133!A1");

    expect(getCell(model, "A1")!.evaluated.value).toBe("#ERROR");
  });

  test("does not throw if invalid sheetId", () => {
    const model = new Model();
    setCellContent(model, "A1", "hello");
    expect(getCell(model, "A1", "invalidSheetId")!).toBe(undefined);
  });

  test("cannot activate an invalid sheet", () => {
    const model = new Model();
    expect(activateSheet(model, "INVALID_ID")).toBeCancelledBecause(CommandResult.InvalidSheetId);
  });

  test("evaluating multiple sheets", () => {
    const model = new Model({
      sheets: [
        {
          name: "ABC",
          colNumber: 10,
          rowNumber: 10,
          cells: { B1: { content: "=DEF!B2" } },
        },
        {
          name: "DEF",
          colNumber: 10,
          rowNumber: 10,
          cells: { B2: { content: "3" } },
        },
      ],
    });

    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("ABC");
    expect(getCell(model, "B1")!.evaluated.value).toBe(3);
  });

  test("evaluating multiple sheets, 2", () => {
    const model = new Model({
      sheets: [
        {
          name: "ABC",
          colNumber: 10,
          rowNumber: 10,
          cells: { B1: { content: "=DEF!B2" } },
        },
        {
          name: "DEF",
          colNumber: 10,
          rowNumber: 10,
          cells: {
            B2: { content: "=A4" },
            A4: { content: "3" },
          },
        },
      ],
    });

    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("ABC");
    const B2 = getCell(model, "B2", "DEF");
    B2;
    expect(getCell(model, "B1")!.evaluated.value).toBe(3);
  });

  test("evaluating multiple sheets, 3 (with range)", () => {
    const model = new Model({
      sheets: [
        {
          name: "ABC",
          colNumber: 10,
          rowNumber: 10,
          cells: { B1: { content: "=DEF!B2" } },
        },
        {
          name: "DEF",
          colNumber: 10,
          rowNumber: 10,
          cells: {
            B2: { content: "=SUM(A1:A5)" },
            A1: { content: "2" },
            A4: { content: "3" },
          },
        },
      ],
    });

    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("ABC");
    expect(getCell(model, "B1")!.evaluated.value).toBe(5);
  });

  test("evaluating multiple sheets: cycles", () => {
    const model = new Model({
      sheets: [
        {
          name: "ABC",
          colNumber: 10,
          rowNumber: 10,
          cells: {
            B1: { content: "=DEF!B2" },
            C3: { content: "=DEF!C5 + 1" },
            C4: { content: "40" },
          },
        },
        {
          name: "DEF",
          colNumber: 10,
          rowNumber: 10,
          cells: {
            B2: { content: "=ABC!B1" },
            C5: { content: "=ABC!C4 + 1" },
          },
        },
      ],
    });

    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("ABC");
    expect(getCell(model, "B1")!.evaluated.value).toBe("#CYCLE");
    expect(getCell(model, "C3")!.evaluated.value).toBe(42);
  });

  test("evaluation from one sheet to another no render", () => {
    const model = new Model({
      sheets: [
        {
          name: "small",
          id: "smallId",
          colNumber: 2,
          rowNumber: 2,
          cells: {
            A2: { content: "=big!A2" },
          },
        },
        {
          name: "big",
          id: "bigId",
          colNumber: 5,
          rowNumber: 5,
          cells: {
            A1: { content: "23" },
            A2: { content: "=A1" },
          },
        },
      ],
    });
    expect(getCell(model, "A2")!.evaluated.value).toBe(23);
  });

  test("cells are updated when dependency in other sheet is updated", () => {
    const model = new Model();
    createSheet(model, { sheetId: "42", activate: true });
    const sheet1 = model.getters.getVisibleSheets()[0];
    const sheet2 = model.getters.getVisibleSheets()[1];

    expect(model.getters.getActiveSheetId()).toEqual(sheet2);
    activateSheet(model, sheet1);
    expect(model.getters.getActiveSheetId()).toEqual(sheet1);
    setCellContent(model, "A1", "=Sheet2!A1");
    expect(getCellContent(model, "A1")).toEqual("0");
    activateSheet(model, sheet2);
    setCellContent(model, "A1", "3");
    activateSheet(model, sheet1);
    expect(model.getters.getActiveSheetId()).toEqual(sheet1);
    expect(getCellContent(model, "A1")).toEqual("3");
  });

  test("can move a sheet", () => {
    const model = new Model();
    createSheet(model, { sheetId: "42" });
    const sheet1 = model.getters.getVisibleSheets()[0];
    const sheet2 = model.getters.getVisibleSheets()[1];
    const beforeMoveSheet = model.exportData();
    model.dispatch("MOVE_SHEET", { sheetId: sheet1, direction: "right" });
    expect(model.getters.getActiveSheetId()).toEqual(sheet1);
    expect(model.getters.getVisibleSheets()[0]).toEqual(sheet2);
    expect(model.getters.getVisibleSheets()[1]).toEqual(sheet1);
    undo(model);
    expect(model.getters.getVisibleSheets()[0]).toEqual(sheet1);
    expect(model.getters.getVisibleSheets()[1]).toEqual(sheet2);
    expect(model).toExport(beforeMoveSheet);
  });

  test("cannot move the first sheet to left and the last to right", () => {
    const model = new Model();
    createSheet(model, { sheetId: "42" });
    const sheet1 = model.getters.getVisibleSheets()[0];
    const sheet2 = model.getters.getVisibleSheets()[1];
    expect(
      model.dispatch("MOVE_SHEET", { sheetId: sheet1, direction: "left" })
    ).toBeCancelledBecause(CommandResult.WrongSheetMove);
    expect(
      model.dispatch("MOVE_SHEET", { sheetId: sheet2, direction: "right" })
    ).toBeCancelledBecause(CommandResult.WrongSheetMove);
  });

  test("Can rename a sheet", () => {
    const model = new Model();
    const sheet = model.getters.getActiveSheetId();
    const name = "NEW_NAME";
    model.dispatch("RENAME_SHEET", { sheetId: sheet, name });
    expect(model.getters.getSheets().find((s) => s.id === sheet)!.name).toBe(name);
  });

  test("Cannot rename an invalid sheet", async () => {
    const model = new Model();
    expect(
      model.dispatch("RENAME_SHEET", {
        sheetId: "invalid",
        name: "hello",
      })
    ).toBeCancelledBecause(CommandResult.InvalidSheetId);
  });

  test("New sheet name is trimmed", () => {
    const model = new Model();
    const sheet = model.getters.getActiveSheetId();
    const name = " NEW_NAME   ";
    model.dispatch("RENAME_SHEET", { sheetId: sheet, name });
    expect(model.getters.getSheets().find((s) => s.id === sheet)!.name).toBe("NEW_NAME");
  });

  test("Cannot rename a sheet with existing name", () => {
    const model = new Model();
    const sheet = model.getters.getActiveSheetId();
    const name = "NEW_NAME";
    createSheetWithName(model, { sheetId: "42" }, name);
    expect(model.dispatch("RENAME_SHEET", { sheetId: sheet, name })).toBeCancelledBecause(
      CommandResult.DuplicatedSheetName
    );
    expect(
      model.dispatch("RENAME_SHEET", { sheetId: sheet, name: "new_name" })
    ).toBeCancelledBecause(CommandResult.DuplicatedSheetName);
    expect(
      model.dispatch("RENAME_SHEET", { sheetId: sheet, name: "new_name " })
    ).toBeCancelledBecause(CommandResult.DuplicatedSheetName);
  });

  test("Cannot rename a sheet without name", () => {
    const model = new Model();
    const sheet = model.getters.getActiveSheetId();
    expect(
      model.dispatch("RENAME_SHEET", { sheetId: sheet, name: undefined })
    ).toBeCancelledBecause(CommandResult.MissingSheetName);
    expect(model.dispatch("RENAME_SHEET", { sheetId: sheet, name: "    " })).toBeCancelledBecause(
      CommandResult.MissingSheetName
    );
  });

  test("Sheet reference are correctly updated", () => {
    const model = new Model();
    const name = "NEW_NAME";
    const sheet1 = model.getters.getActiveSheetId();
    setCellContent(model, "A1", "=NEW_NAME!A1");
    createSheetWithName(model, { sheetId: "42", activate: true }, name);
    const sheet2 = model.getters.getActiveSheetId();
    setCellContent(model, "A1", "42");
    const nextName = "NEXT NAME";
    model.dispatch("RENAME_SHEET", { sheetId: sheet2, name: nextName });
    activateSheet(model, sheet1);
    expect(getCellText(model, "A1")).toBe("='NEXT NAME'!A1");
    undo(model); // Activate Sheet
    undo(model); // Rename sheet
    activateSheet(model, sheet1);
    expect(getCellText(model, "A1")).toBe("=NEW_NAME!A1");
  });

  test("Cells have the correct value after rename sheet", () => {
    const model = new Model();
    const name = "NEW_NAME";
    const sheet2 = "42";
    createSheetWithName(model, { sheetId: sheet2 }, name);
    setCellContent(model, "A1", "=NEW_NAME!A1");
    setCellContent(model, "A1", "24", sheet2);
    const nextName = "NEXT NAME";
    model.dispatch("RENAME_SHEET", { sheetId: sheet2, name: nextName });
    expect(getCellText(model, "A1")).toBe("='NEXT NAME'!A1");
    expect(getCell(model, "A1")!.evaluated.value).toBe(24);
  });

  test("tryGetSheetName with an existing sheet", () => {
    const model = new Model();
    const sheetId = model.getters.getActiveSheetId();
    expect(model.getters.tryGetSheetName(sheetId)).toBe("Sheet1");
  });

  test("tryGetSheetName with a sheet which does not exist", () => {
    const model = new Model();
    expect(model.getters.tryGetSheetName("Sheet999")).toBeUndefined();
  });

  test("Rename a sheet will call editText", async () => {
    const editText = jest.fn();
    const model = new Model(
      {
        sheets: [
          {
            colNumber: 5,
            rowNumber: 5,
          },
        ],
      },
      { editText }
    );
    model.dispatch("RENAME_SHEET", {
      sheetId: model.getters.getActiveSheetId(),
      interactive: true,
    });
    expect(editText).toHaveBeenCalled();
  });

  test("Rename a sheet with interaction", async () => {
    const editText = jest.fn(
      (title: string, placeholder: string, callback: (text: string | null) => any) => {
        callback("new name");
      }
    );
    const model = new Model(
      {
        sheets: [
          {
            colNumber: 5,
            rowNumber: 5,
          },
        ],
      },
      { editText }
    );
    model.dispatch("RENAME_SHEET", {
      sheetId: model.getters.getActiveSheetId(),
      interactive: true,
    });
    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("new name");
  });

  test("Can duplicate a sheet", () => {
    const model = new Model();
    const sheet = model.getters.getActiveSheetId();
    const name = `Copy of ${model.getters.getSheets()[0].name}`;
    model.dispatch("DUPLICATE_SHEET", { sheetId: sheet, sheetIdTo: model.uuidGenerator.uuidv4() });
    const sheets = model.getters.getSheets();
    expect(sheets).toHaveLength(2);
    expect(sheets[sheets.length - 1].name).toBe(name);
    undo(model);
    expect(model.getters.getSheets()).toHaveLength(1);
    redo(model);
    expect(model.getters.getSheets()).toHaveLength(2);
  });

  test("Duplicate a sheet does not make the newly created active", () => {
    const model = new Model();
    const sheetId = model.getters.getActiveSheetId();
    model.dispatch("DUPLICATE_SHEET", { sheetId: sheetId, sheetIdTo: "42" });
    expect(model.getters.getActiveSheetId()).toBe(sheetId);
  });

  test("Properties of sheet are correctly duplicated", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 5,
          rowNumber: 5,
          merges: ["B1:C2"],
          conditionalFormats: [
            {
              id: "1",
              ranges: ["A1:A2"],
              rule: {
                values: ["42"],
                operator: "Equal",
                type: "CellIsRule",
                style: { fillColor: "orange" },
              },
            },
          ],
        },
      ],
    });
    const sheet = model.getters.getActiveSheetId();
    setCellContent(model, "A1", "42");
    model.dispatch("DUPLICATE_SHEET", { sheetId: sheet, sheetIdTo: model.uuidGenerator.uuidv4() });
    expect(model.getters.getSheets()).toHaveLength(2);
    const newSheet = model.getters.getSheets()[1].id;
    activateSheet(model, newSheet);
    expect(getCellContent(model, "A1")).toBe("42");
    expect(model.getters.getActiveSheet().cols.length).toBe(5);
    expect(model.getters.getActiveSheet().rows.length).toBe(5);
    expect(model.getters.getConditionalStyle(...toCartesian("A1"))).toEqual({
      fillColor: "orange",
    });
  });

  test("CFs of sheets are correctly duplicated", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 5,
          rowNumber: 5,
          conditionalFormats: [
            {
              id: "1",
              ranges: ["A1:A2"],
              rule: {
                values: ["42"],
                operator: "Equal",
                type: "CellIsRule",
                style: { fillColor: "orange" },
              },
            },
          ],
        },
      ],
    });
    const sheet = model.getters.getActiveSheetId();
    setCellContent(model, "A1", "42");
    model.dispatch("DUPLICATE_SHEET", { sheetId: sheet, sheetIdTo: model.uuidGenerator.uuidv4() });
    expect(model.getters.getSheets()).toHaveLength(2);
    const newSheetId = model.getters.getSheets()[1].id;
    activateSheet(model, newSheetId);
    expect(getCellContent(model, "A1")).toBe("42");
    expect(model.getters.getConditionalStyle(...toCartesian("A1"))).toEqual({
      fillColor: "orange",
    });
    expect(model.getters.getConditionalFormats(newSheetId)).toHaveLength(1);
    model.dispatch("ADD_CONDITIONAL_FORMAT", {
      cf: createEqualCF("42", { fillColor: "blue" }, "1"),
      target: [toZone("A1:A2")],
      sheetId: model.getters.getActiveSheetId(),
    });
    expect(model.getters.getConditionalStyle(...toCartesian("A1"))).toEqual({ fillColor: "blue" });
    expect(model.getters.getConditionalFormats(newSheetId)).toHaveLength(1);
    activateSheet(model, sheet);
    expect(model.getters.getConditionalStyle(...toCartesian("A1"))).toEqual({
      fillColor: "orange",
    });
    expect(model.getters.getConditionalFormats(newSheetId)).toHaveLength(1);
  });

  test("Cells are correctly duplicated", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 5,
          rowNumber: 5,
          cells: {
            A1: { content: "42" },
          },
        },
      ],
    });
    const sheet = model.getters.getActiveSheetId();
    model.dispatch("DUPLICATE_SHEET", { sheetId: sheet, sheetIdTo: model.uuidGenerator.uuidv4() });
    expect(model.getters.getSheets()).toHaveLength(2);
    const newSheet = model.getters.getSheets()[1].id;
    activateSheet(model, newSheet);
    expect(getCellContent(model, "A1")).toBe("42");
    setCellContent(model, "A1", "24");
    expect(getCellContent(model, "A1")).toBe("24");
    activateSheet(model, sheet);
    expect(getCellContent(model, "A1")).toBe("42");
  });

  test("Figures of Charts are correctly duplicated", () => {
    const model = new Model();
    const sheetId = model.getters.getActiveSheetId();
    const chartId = "uuid";
    createChart(model, { dataSets: ["Sheet1!B1:B4"], labelRange: "Sheet1!A2:A4" }, chartId);
    model.dispatch("DUPLICATE_SHEET", { sheetId, sheetIdTo: "42" });
    model.dispatch("UPDATE_FIGURE", {
      sheetId: sheetId,
      id: chartId,
      x: 40,
    });

    const figure1 = model.getters.getFigures(sheetId);
    const figure2 = model.getters.getFigures("42");
    expect(figure1).toEqual([{ height: 335, id: chartId, tag: "chart", width: 536, x: 40, y: 0 }]);
    expect(figure2).toMatchObject([{ height: 335, tag: "chart", width: 536, x: 0, y: 0 }]);
  });

  test("Cols and Rows are correctly duplicated", () => {
    const model = new Model();
    const sheet = model.getters.getActiveSheetId();
    model.dispatch("DUPLICATE_SHEET", { sheetId: sheet, sheetIdTo: model.uuidGenerator.uuidv4() });
    expect(model.getters.getSheets()).toHaveLength(2);
    resizeColumns(model, ["A"], 1);
    resizeRows(model, [0], 1);
    const newSheet = model.getters.getSheets()[1].id;
    activateSheet(model, newSheet);
    expect(model.getters.getCol(model.getters.getActiveSheetId(), 0)!.size).not.toBe(1);
    expect(model.getters.getRow(model.getters.getActiveSheetId(), 0)!.size).not.toBe(1);
  });

  test("Merges are correctly duplicated", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 5,
          rowNumber: 5,
          merges: ["A1:A2"],
        },
      ],
    });
    const sheet = model.getters.getActiveSheetId();
    model.dispatch("DUPLICATE_SHEET", { sheetId: sheet, sheetIdTo: model.uuidGenerator.uuidv4() });
    expect(model.getters.getSheets()).toHaveLength(2);
    unMerge(model, "A1:A2");
    const newSheet = model.getters.getSheets()[1].id;
    activateSheet(model, newSheet);
    expect(model.exportData().sheets[0].merges).toHaveLength(0);
    expect(model.exportData().sheets[1].merges).toHaveLength(1);
  });

  test("Can delete the active sheet", () => {
    const model = new Model();
    const sheet1 = model.getters.getActiveSheetId();
    createSheet(model, { sheetId: "42", activate: true });
    const sheet2 = model.getters.getActiveSheetId();
    model.dispatch("DELETE_SHEET", { sheetId: sheet2 });
    expect(model.getters.getSheets()).toHaveLength(1);
    expect(model.getters.getSheets()[0].id).toEqual(sheet1);
    expect(model.getters.getActiveSheetId()).toEqual(sheet1);
    undo(model);
    expect(model.getters.getSheets()).toHaveLength(2);
    expect(model.getters.getActiveSheetId()).toEqual(sheet1);
    redo(model);
    expect(model.getters.getSheets()).toHaveLength(1);
    expect(model.getters.getActiveSheetId()).toEqual(sheet1);
  });

  test("Can delete the first sheet (active)", () => {
    const model = new Model();
    const sheet1 = model.getters.getActiveSheetId();
    const sheet2 = "Sheet2";
    createSheet(model, { sheetId: sheet2 });
    setCellContent(model, "A1", "Hello in Sheet2", sheet2);
    model.dispatch("DELETE_SHEET", { sheetId: sheet1 });
    expect(model.getters.getActiveSheetId()).toBe(sheet2);
    expect(getCellContent(model, "A1")).toBe("Hello in Sheet2");
  });

  test("Can delete a non-active sheet", () => {
    const model = new Model();
    const sheet1 = model.getters.getActiveSheetId();
    createSheet(model, { sheetId: "42", activate: true });
    const sheet2 = model.getters.getSheets()[1].id;
    model.dispatch("DELETE_SHEET", { sheetId: sheet1 });
    expect(model.getters.getSheets()).toHaveLength(1);
    expect(model.getters.getSheets()[0].id).toEqual(sheet2);
    expect(model.getters.getActiveSheetId()).toEqual(sheet2);
  });

  test("Cannot delete sheet if there is only one", () => {
    const model = new Model();
    expect(
      model.dispatch("DELETE_SHEET", { sheetId: model.getters.getActiveSheetId() })
    ).toBeCancelledBecause(CommandResult.NotEnoughSheets);
  });

  test("Can undo-redo a sheet deletion", () => {
    const model = new Model();
    createSheet(model, { sheetId: "42" });
    testUndoRedo(model, expect, "DELETE_SHEET", { sheetId: "42" });
  });

  test("Can undo-redo a sheet renaming", () => {
    const model = new Model();
    testUndoRedo(model, expect, "RENAME_SHEET", {
      sheetId: model.getters.getActiveSheetId(),
      name: "New name",
    });
  });

  test("Can undo-redo a sheet duplication", () => {
    const model = new Model();
    testUndoRedo(model, expect, "DUPLICATE_SHEET", {
      sheetIdTo: "42",
      sheetId: model.getters.getActiveSheetId(),
    });
  });

  test("Sheet reference are correctly marked as #REF on sheet deletion", () => {
    const model = new Model();
    const name = "NEW_NAME";
    const sheet1 = model.getters.getActiveSheetId();
    setCellContent(model, "A1", "=NEW_NAME!A1");
    createSheetWithName(model, { sheetId: "42", activate: true }, name);
    const sheet2 = model.getters.getActiveSheetId();
    setCellContent(model, "A1", "42");
    model.dispatch("DELETE_SHEET", { sheetId: sheet2 });
    expect(getCellText(model, "A1")).toBe("=NEW_NAME!A1");
    expect(getCell(model, "A1")?.evaluated.value).toBe("#ERROR");
    undo(model);
    activateSheet(model, sheet1);
    expect(getCellText(model, "A1")).toBe("=NEW_NAME!A1");
    expect(getCell(model, "A1")?.evaluated.value).toBe(42);
  });

  test("UPDATE_CELL_POSITION remove the old position if exist", () => {
    const model = new Model();
    setCellContent(model, "A1", "test");
    const cell = getCell(model, "A1")!;
    model.dispatch("UPDATE_CELL_POSITION", {
      sheetId: model.getters.getActiveSheetId(),
      col: 1,
      row: 1,
      cell,
      cellId: cell.id,
    });
    const sheet = model.getters.getActiveSheet();
    expect(sheet.rows[0].cells[0]).toBeUndefined();
    expect(sheet.rows[1].cells[1]!.id).toBe(cell.id);
    expect(model.getters.getCellPosition(cell.id)).toEqual({
      col: 1,
      row: 1,
      sheetId: model.getters.getActiveSheetId(),
    });
  });

  test("Cannot remove more columns/rows than there are inside the sheet", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 1,
          rowNumber: 3,
        },
      ],
    });
    expect(deleteRows(model, [1, 2, 3, 4])).toBeCancelledBecause(CommandResult.NotEnoughElements);
  });

  test("Cannot have all rows/columns hidden at once", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 1,
          rowNumber: 4,
          rows: { 2: { isHidden: true } },
        },
      ],
    });
    expect(hideRows(model, [0, 1, 3])).toBeCancelledBecause(CommandResult.TooManyHiddenElements);
  });

  test("Can set the grid lines visibility", () => {
    const model = new Model();
    const sheetId = model.getters.getActiveSheetId();
    expect(model.getters.getGridLinesVisibility(sheetId)).toBe(true);
    model.dispatch("SET_GRID_LINES_VISIBILITY", { sheetId, areGridLinesVisible: false });
    expect(model.getters.getGridLinesVisibility(sheetId)).toBe(false);
    model.dispatch("SET_GRID_LINES_VISIBILITY", { sheetId, areGridLinesVisible: true });
    expect(model.getters.getGridLinesVisibility(sheetId)).toBe(true);
  });

  test("Dispatch set the grid lines visibility on invalid sheet", () => {
    const model = new Model();
    const sheetId = "invalid";
    expect(
      model.dispatch("SET_GRID_LINES_VISIBILITY", { sheetId, areGridLinesVisible: false })
    ).toBeCancelledBecause(CommandResult.InvalidSheetId);
  });

  test("Can undo/redo grid lines visibility", () => {
    const model = new Model();
    const sheetId = model.getters.getActiveSheetId();
    expect(model.getters.getGridLinesVisibility(sheetId)).toBe(true);
    model.dispatch("SET_GRID_LINES_VISIBILITY", { sheetId, areGridLinesVisible: false });
    expect(model.getters.getGridLinesVisibility(sheetId)).toBe(false);
    undo(model);
    expect(model.getters.getGridLinesVisibility(sheetId)).toBe(true);
    redo(model);
    expect(model.getters.getGridLinesVisibility(sheetId)).toBe(false);
  });

  test("isEmpty getter", () => {
    const model = new Model();
    const sheetId = model.getters.getActiveSheetId();
    setCellContent(model, "A1", "hello");
    expect(model.getters.isEmpty(sheetId, toZone("A1"))).toBe(false);
    expect(model.getters.isEmpty(sheetId, toZone("A1:A2"))).toBe(false);
    expect(model.getters.isEmpty(sheetId, toZone("A2"))).toBe(true);
    expect(model.getters.isEmpty(sheetId, toZone("A2:A3"))).toBe(true);
    merge(model, "A1:A2");
    expect(model.getters.isEmpty(sheetId, toZone("A2"))).toBe(true);
    expect(model.getters.isEmpty(sheetId, toZone("A2:A3"))).toBe(true);
  });

  test.each(["Sheet", "My sheet"])("getSheetIdByName", (name) => {
    const model = new Model();
    const sheetId = model.getters.getActiveSheetId();
    model.dispatch("RENAME_SHEET", {
      sheetId,
      name,
    });
    expect(model.getters.getSheetIdByName(name)).toBe(sheetId);
    expect(model.getters.getSheetIdByName(`'${name}'`)).toBe(sheetId);
    expect(model.getters.getSheetIdByName(getComposerSheetName(name))).toBe(sheetId);
  });

  test("getSheetIdByName with invalid name", () => {
    const model = new Model();
    expect(model.getters.getSheetIdByName("this name does not exist")).toBeUndefined();
  });

  test("getSheetIdByName works with non-matching case", () => {
    const model = new Model();
    const sheetId = model.getters.getActiveSheetId();
    model.dispatch("RENAME_SHEET", {
      sheetId,
      name: "Sheet1",
    });
    expect(model.getters.getSheetIdByName("shEeT1")).toBeDefined();
  });
});
