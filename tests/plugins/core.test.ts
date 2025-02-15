import { functionRegistry } from "../../src/functions/index";
import { Model } from "../../src/model";
import { CommandResult } from "../../src/types";
import {
  activateSheet,
  addColumns,
  addRows,
  createSheet,
  redo,
  resizeColumns,
  resizeRows,
  selectCell,
  setCellContent,
  undo,
} from "../test_helpers/commands_helpers";
import {
  getCell,
  getCellContent,
  getCellError,
  getRangeFormattedValues,
  getRangeValues,
} from "../test_helpers/getters_helpers";

describe("core", () => {
  describe("aggregate", () => {
    test("properly compute sum of current cells", () => {
      const model = new Model();
      setCellContent(model, "A2", "3");
      setCellContent(model, "A3", "54");

      expect(model.getters.getAggregate()).toBe(null);

      selectCell(model, "A1");

      expect(model.getters.getAggregate()).toBe(null);

      model.dispatch("ALTER_SELECTION", { cell: [0, 2] });
      expect(model.getters.getAggregate()).toBe("57");
    });

    test("ignore cells with an error", () => {
      const model = new Model();
      setCellContent(model, "A1", "2");
      setCellContent(model, "A2", "=A2");
      setCellContent(model, "A3", "3");

      // select A1
      selectCell(model, "A1");
      expect(model.getters.getAggregate()).toBe(null);

      // select A1:A2
      model.dispatch("ALTER_SELECTION", { cell: [0, 1] });
      expect(model.getters.getAggregate()).toBe(null);

      // select A1:A3
      model.dispatch("ALTER_SELECTION", { cell: [0, 2] });
      expect(model.getters.getAggregate()).toBe("5");
    });

    describe("raise error from compilation with specific error message", () => {
      functionRegistry.add("TWOARGSNEEDED", {
        description: "any function",
        compute: () => {
          return true;
        },
        args: [
          { name: "arg1", description: "", type: ["ANY"] },
          { name: "arg2", description: "", type: ["ANY"] },
        ],
        returns: ["ANY"],
      });

      const model = new Model();
      setCellContent(model, "A1", "=TWOARGSNEEDED(42)");

      expect(getCell(model, "A1")!.evaluated.value).toBe("#BAD_EXPR");
      expect(getCellError(model, "A1")).toBe(
        `Invalid number of arguments for the TWOARGSNEEDED function. Expected 2 minimum, but got 1 instead.`
      );
    });
  });

  describe("format", () => {
    test("format cell that point to an empty cell properly", () => {
      const model = new Model();
      setCellContent(model, "A1", "=A2");

      expect(getCellContent(model, "A1")).toBe("0");
    });

    test("format cell without content: empty string", () => {
      const model = new Model();
      selectCell(model, "B2");
      model.dispatch("SET_FORMATTING", {
        sheetId: model.getters.getActiveSheetId(),
        target: model.getters.getSelectedZones(),
        border: "bottom",
      });
      expect(getCellContent(model, "B2")).toBe("");
    });

    test("format cell with the zero value", () => {
      const model = new Model();
      setCellContent(model, "A1", "0");
      selectCell(model, "A1");
      model.dispatch("SET_FORMATTING", {
        sheetId: model.getters.getActiveSheetId(),
        target: model.getters.getSelectedZones(),
        format: "0.00000",
      });
      expect(getCellContent(model, "A1")).toBe("0.00000");
      setCellContent(model, "A2", "0");
      selectCell(model, "A2");
      model.dispatch("SET_FORMATTING", {
        sheetId: model.getters.getActiveSheetId(),
        target: model.getters.getSelectedZones(),
        format: "0.00%",
      });
      expect(getCellContent(model, "A2")).toBe("0.00%");
    });

    test("evaluate properly a cell with a style just recently applied", () => {
      const model = new Model();
      setCellContent(model, "A1", "=sum(A2) + 1");
      model.dispatch("SET_FORMATTING", {
        sheetId: model.getters.getActiveSheetId(),
        target: [{ left: 0, top: 0, right: 0, bottom: 0 }],
        style: { bold: true },
      });
      expect(getCellContent(model, "A1")).toEqual("1");
    });

    test("format cell to a boolean value", () => {
      const model = new Model();
      setCellContent(model, "A1", "=false");
      setCellContent(model, "A2", "=true");

      expect(getCellContent(model, "A1")).toBe("FALSE");
      expect(getCellContent(model, "A2")).toBe("TRUE");
    });

    test("detect and format percentage values automatically", () => {
      const model = new Model();
      setCellContent(model, "A1", "3%");
      setCellContent(model, "A2", "3.4%");

      expect(getCellContent(model, "A1")).toBe("3%");
      expect(getCell(model, "A1")!.format).toBe("0%");
      expect(getCellContent(model, "A2")).toBe("3.40%");
      expect(getCell(model, "A2")!.format).toBe("0.00%");
    });

    describe("detect format formula automatically", () => {
      test("from formula without return format", () => {
        const model = new Model();
        setCellContent(model, "A1", "=CONCAT(4,2)");
        setCellContent(model, "A2", "=COS(42)");

        expect(getCell(model, "A1")!.format).toBeUndefined();
        expect(getCell(model, "A2")!.format).toBeUndefined();
      });

      test("from formula with return format", () => {
        const model = new Model();
        setCellContent(model, "A1", "=TIME(42,42,42)");
        expect(getCell(model, "A1")!.format).toBe("hh:mm:ss a");
      });

      describe("from formula depending on the reference", () => {
        test("with the reference declared before the formula", () => {
          const model = new Model();
          setCellContent(model, "A1", "3%");
          setCellContent(model, "A2", "=1+A1");

          expect(getCell(model, "A1")!.format).toBe("0%");
          expect(getCell(model, "A2")!.format).toBe("0%");
        });

        test("with the formula declared before the reference ", () => {
          const model = new Model();
          setCellContent(model, "A1", "=1+A2");
          setCellContent(model, "A2", "3%");

          expect(getCell(model, "A1")!.format).toBeUndefined();
          expect(getCell(model, "A2")!.format).toBe("0%");
        });
      });
    });
  });

  test("does not reevaluate cells if edition does not change content", () => {
    const model = new Model();
    setCellContent(model, "A1", "=rand()");

    expect(getCell(model, "A1")!.evaluated.value).toBeDefined();
    const val = getCell(model, "A1")!.evaluated.value;

    model.dispatch("START_EDITION");
    model.dispatch("STOP_EDITION");
    expect(getCell(model, "A1")!.evaluated.value).toBe(val);
  });

  test("getCell getter does not crash if invalid col/row", () => {
    const model = new Model();
    const sheetId = model.getters.getActiveSheetId();
    expect(model.getters.getCell(sheetId, -1, -1)).toBeUndefined();
  });

  test("single cell XC conversion", () => {
    const model = new Model({});
    expect(
      model.getters.zoneToXC(
        model.getters.getActiveSheetId(),
        /*A1*/ { top: 0, left: 0, right: 0, bottom: 0 }
      )
    ).toBe("A1");
  });

  test("multi cell zone XC conversion", () => {
    const model = new Model({});
    expect(
      model.getters.zoneToXC(
        model.getters.getActiveSheetId(),
        /*A1:B2*/ { top: 0, left: 0, right: 1, bottom: 1 }
      )
    ).toBe("A1:B2");
  });

  test("xc is expanded to overlapping merges", () => {
    const model = new Model({
      sheets: [{ colNumber: 10, rowNumber: 10, merges: ["A1:B2"] }],
    });
    expect(
      model.getters.zoneToXC(
        model.getters.getActiveSheetId(),
        /*A2:B3*/ { top: 1, bottom: 2, left: 0, right: 1 }
      )
    ).toBe("A1:B3");
  });

  test("zone is across two merges", () => {
    const model = new Model({
      sheets: [{ colNumber: 10, rowNumber: 10, merges: ["A1:B2", "A4:B5"] }],
    });
    expect(
      model.getters.zoneToXC(
        model.getters.getActiveSheetId(),
        /*A2:B4*/ { top: 1, bottom: 3, left: 0, right: 1 }
      )
    ).toBe("A1:B5");
  });

  test("merge is considered as one single cell", () => {
    const model = new Model({
      sheets: [{ colNumber: 10, rowNumber: 10, merges: ["A1:B2"] }],
    });
    expect(
      model.getters.zoneToXC(
        model.getters.getActiveSheetId(),
        /*A2:B2*/ { top: 1, bottom: 1, left: 0, right: 1 }
      )
    ).toBe("A1");
  });

  test("can get row/col of inactive sheet", () => {
    const model = new Model();
    createSheet(model, { sheetId: "42" });
    const [, sheet2] = model.getters.getSheets();
    resizeRows(model, [0], 24, sheet2.id);
    resizeColumns(model, ["A"], 42, sheet2.id);
    expect(sheet2.id).not.toBe(model.getters.getActiveSheetId());
    expect(model.getters.getRow(sheet2.id, 0)).toEqual({
      cells: {},
      end: 24,
      name: "1",
      size: 24,
      start: 0,
    });
    expect(model.getters.getCol(sheet2.id, 0)).toEqual({ end: 42, name: "A", size: 42, start: 0 });
  });

  test("can get row/col number of inactive sheet", () => {
    const model = new Model({
      sheets: [
        { colNumber: 10, rowNumber: 10, id: "1" },
        { colNumber: 19, rowNumber: 29, id: "2" },
      ],
    });
    expect(model.getters.getActiveSheetId()).not.toBe("2");
    expect(model.getters.getSheet("2").rows.length).toEqual(29);
    expect(model.getters.getSheet("2").cols.length).toEqual(19);
  });

  test("Range with absolute references are correctly updated on rows manipulation", () => {
    const model = new Model();
    model.dispatch("SET_FORMULA_VISIBILITY", { show: true });
    setCellContent(model, "A1", "=SUM($C$1:$C$5)");
    addRows(model, "after", 2, 1);
    expect(getCellContent(model, "A1")).toBe("=SUM($C$1:$C$6)");
    addRows(model, "before", 0, 1);
    expect(getCellContent(model, "A2")).toBe("=SUM($C$2:$C$7)");
  });

  test("Absolute references are correctly updated on rows manipulation", () => {
    const model = new Model();
    model.dispatch("SET_FORMULA_VISIBILITY", { show: true });
    setCellContent(model, "A1", "=SUM($C$1)");
    addRows(model, "after", 2, 1);
    expect(getCellContent(model, "A1")).toBe("=SUM($C$1)");
    addRows(model, "before", 0, 1);
    expect(getCellContent(model, "A2")).toBe("=SUM($C$2)");
  });

  test("Range with absolute references are correctly updated on columns manipulation", () => {
    const model = new Model();
    model.dispatch("SET_FORMULA_VISIBILITY", { show: true });
    setCellContent(model, "A1", "=SUM($A$2:$E$2)");
    addColumns(model, "after", "C", 1);
    expect(getCellContent(model, "A1")).toBe("=SUM($A$2:$F$2)");
    addColumns(model, "before", "A", 1);
    expect(getCellContent(model, "B1")).toBe("=SUM($B$2:$G$2)");
  });

  test("Absolute references are correctly updated on columns manipulation", () => {
    const model = new Model();
    model.dispatch("SET_FORMULA_VISIBILITY", { show: true });
    setCellContent(model, "A1", "=SUM($A$2)");
    addColumns(model, "after", "C", 1);
    expect(getCellContent(model, "A1")).toBe("=SUM($A$2)");
    addColumns(model, "before", "A", 1);
    expect(getCellContent(model, "B1")).toBe("=SUM($B$2)");
  });
});

describe("history", () => {
  test("can undo and redo a add cell operation", () => {
    const model = new Model();

    expect(model.getters.canUndo()).toBe(false);
    expect(model.getters.canRedo()).toBe(false);

    setCellContent(model, "A1", "abc");
    expect(model.getters.canUndo()).toBe(true);
    expect(model.getters.canRedo()).toBe(false);

    undo(model);
    expect(getCell(model, "A1")).toBeUndefined();
    expect(model.getters.canUndo()).toBe(false);
    expect(model.getters.canRedo()).toBe(true);

    redo(model);
    expect(getCellContent(model, "A1")).toBe("abc");
    expect(model.getters.canUndo()).toBe(true);
    expect(model.getters.canRedo()).toBe(false);
  });

  test("can undo and redo a cell update", () => {
    const model = new Model({
      sheets: [{ colNumber: 10, rowNumber: 10, cells: { A1: { content: "1" } } }],
    });

    expect(model.getters.canUndo()).toBe(false);
    expect(model.getters.canRedo()).toBe(false);

    model.dispatch("START_EDITION", { text: "abc" });
    model.dispatch("STOP_EDITION");

    expect(getCellContent(model, "A1")).toBe("abc");
    expect(model.getters.canUndo()).toBe(true);
    expect(model.getters.canRedo()).toBe(false);

    undo(model);
    expect(getCellContent(model, "A1")).toBe("1");
    expect(model.getters.canUndo()).toBe(false);
    expect(model.getters.canRedo()).toBe(true);

    redo(model);
    expect(getCellContent(model, "A1")).toBe("abc");
    expect(model.getters.canUndo()).toBe(true);
    expect(model.getters.canRedo()).toBe(false);
  });

  test("can undo and redo a delete cell operation", () => {
    const model = new Model();
    setCellContent(model, "A2", "3");

    expect(getCellContent(model, "A2")).toBe("3");
    selectCell(model, "A2");
    model.dispatch("DELETE_CONTENT", {
      sheetId: model.getters.getActiveSheetId(),
      target: model.getters.getSelectedZones(),
    });
    expect(getCell(model, "A2")).toBeUndefined();

    undo(model);
    expect(getCellContent(model, "A2")).toBe("3");

    redo(model);
    expect(getCell(model, "A2")).toBeUndefined();
  });

  test("can delete a cell with a style", () => {
    const model = new Model();
    setCellContent(model, "A1", "3");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: [{ left: 0, top: 0, right: 0, bottom: 0 }],
      style: { bold: true },
    });

    expect(getCellContent(model, "A1")).toBe("3");

    model.dispatch("DELETE_CONTENT", {
      sheetId: model.getters.getActiveSheetId(),
      target: [{ left: 0, top: 0, right: 0, bottom: 0 }],
    });
    expect(getCellContent(model, "A1")).toBe("");
  });

  test("can delete a cell with a border", () => {
    const model = new Model();
    setCellContent(model, "A1", "3");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: [{ left: 0, top: 0, right: 0, bottom: 0 }],
      border: "bottom",
    });

    expect(getCellContent(model, "A1")).toBe("3");

    model.dispatch("DELETE_CONTENT", {
      sheetId: model.getters.getActiveSheetId(),
      target: [{ left: 0, top: 0, right: 0, bottom: 0 }],
    });
    expect(getCellContent(model, "A1")).toBe("");
  });

  test("can delete a cell with a format", () => {
    const model = new Model();
    setCellContent(model, "A1", "3");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: [{ left: 0, top: 0, right: 0, bottom: 0 }],
      format: "#,##0.00",
    });

    expect(getCellContent(model, "A1")).toBe("3.00");

    model.dispatch("DELETE_CONTENT", {
      sheetId: model.getters.getActiveSheetId(),
      target: [{ left: 0, top: 0, right: 0, bottom: 0 }],
    });
    expect(getCellContent(model, "A1")).toBe("");
  });

  test("setting a date to a cell will reformat it", () => {
    const model = new Model();
    setCellContent(model, "A1", "03/2/2011");
    setCellContent(model, "A2", " 03/12/2011");
    expect(getCellContent(model, "A1")).toBe("03/02/2011");
    expect(getCellContent(model, "A2")).toBe("03/12/2011");
  });

  test("get cell formula text", () => {
    const model = new Model();
    setCellContent(model, "A1", "=SUM(1, 2)");
    setCellContent(model, "A2", "This is Patrick");
    model.dispatch("SET_FORMULA_VISIBILITY", { show: true });
    expect(getCellContent(model, "A1")).toBe("=SUM(1, 2)");
    expect(getCellContent(model, "A2")).toBe("This is Patrick");
    model.dispatch("SET_FORMULA_VISIBILITY", { show: false });
    expect(getCellContent(model, "A1")).toBe("3");
    expect(getCellContent(model, "A2")).toBe("This is Patrick");
  });

  test("set formula visibility is idempotent", () => {
    const model = new Model();
    model.dispatch("SET_FORMULA_VISIBILITY", { show: true });
    expect(model.getters.shouldShowFormulas()).toBe(true);
    model.dispatch("SET_FORMULA_VISIBILITY", { show: true });
    expect(model.getters.shouldShowFormulas()).toBe(true);
    model.dispatch("SET_FORMULA_VISIBILITY", { show: false });
    expect(model.getters.shouldShowFormulas()).toBe(false);
  });

  test("Cannot update a cell in invalid sheet", async () => {
    const model = new Model();
    expect(setCellContent(model, "B2", "hello", "invalid")).toBeCancelledBecause(
      CommandResult.InvalidSheetId
    );
  });

  test("Can select a cell in another sheet", async () => {
    const model = new Model({
      sheets: [
        { id: "1", cells: { A1: { content: "Sheet1A1" } } },
        { id: "2", cells: { A1: { content: "Sheet2A1" } } },
      ],
    });
    expect(getCellContent(model, "A1", "1")).toBe("Sheet1A1");
    expect(getCellContent(model, "A1", "2")).toBe("Sheet2A1");
  });

  describe("getters", () => {
    test("getRangeFormattedValues", () => {
      const sheet1Id = "42";
      const sheet2Id = "43";
      const model = new Model({
        sheets: [
          {
            id: sheet1Id,
            colNumber: 10,
            rowNumber: 10,
            cells: {
              A1: { content: "1000", format: "#,##0" },
              A3: { content: "2000", format: "#,##0" },
              B2: { content: "TRUE", format: "#,##0" },
            },
          },
          {
            id: sheet2Id,
            colNumber: 10,
            rowNumber: 10,
            cells: {
              A1: { content: "21000", format: "#,##0" },
              A3: { content: "12-31-2020", format: "mm/dd/yyyy" },
              B2: { content: "TRUE", format: "#,##0" },
            },
          },
        ],
      });
      activateSheet(model, sheet2Id); // evaluate Sheet2
      expect(getRangeFormattedValues(model, "A1:A3", sheet1Id)).toEqual([["1,000", "", "2,000"]]);
      expect(getRangeFormattedValues(model, "$A$1:$A$3", sheet1Id)).toEqual([
        ["1,000", "", "2,000"],
      ]);
      expect(getRangeFormattedValues(model, "Sheet1!A1:A3", sheet1Id)).toEqual([
        ["1,000", "", "2,000"],
      ]);
      expect(getRangeFormattedValues(model, "Sheet2!A1:A3", sheet2Id)).toEqual([
        ["21,000", "", "12/31/2020"],
      ]);
      expect(getRangeFormattedValues(model, "Sheet2!A1:A3", sheet1Id)).toEqual([
        ["21,000", "", "12/31/2020"],
      ]);
      expect(getRangeFormattedValues(model, "'Sheet2'!A1:A3", sheet1Id)).toEqual([
        ["21,000", "", "12/31/2020"],
      ]);
      expect(getRangeFormattedValues(model, "B2", sheet1Id)).toEqual([["TRUE"]]);
      expect(getRangeFormattedValues(model, "Sheet1!B2", sheet1Id)).toEqual([["TRUE"]]);
      expect(getRangeFormattedValues(model, "Sheet2!B2", sheet2Id)).toEqual([["TRUE"]]);
      expect(getRangeFormattedValues(model, "Sheet2!B2", sheet1Id)).toEqual([["TRUE"]]);
      expect(getRangeFormattedValues(model, "'Sheet2'!B2", sheet1Id)).toEqual([["TRUE"]]);
    });

    test("getRangeValues", () => {
      const sheet1Id = "42";
      const sheet2Id = "43";
      const model = new Model({
        sheets: [
          {
            id: sheet1Id,
            colNumber: 10,
            rowNumber: 10,
            cells: {
              A1: { content: "1000", format: "#,##0" },
              A3: { content: "2000", format: "#,##0" },
              B2: { content: "TRUE", format: "#,##0" },
            },
          },
          {
            id: sheet2Id,
            colNumber: 10,
            rowNumber: 10,
            cells: {
              A1: { content: "21000", format: "#,##0" },
              A3: { content: "12-31-2020", format: "mm/dd/yyyy" },
              B2: { content: "TRUE", format: "#,##0" },
            },
          },
        ],
      });
      expect(getRangeValues(model, "A1:A3", sheet1Id)).toEqual([[1000, undefined, 2000]]);
      expect(getRangeValues(model, "$A$1:$A$3", sheet1Id)).toEqual([[1000, undefined, 2000]]);
      expect(getRangeValues(model, "Sheet1!A1:A3", sheet1Id)).toEqual([[1000, undefined, 2000]]);
      expect(getRangeValues(model, "Sheet2!A1:A3", sheet2Id)).toEqual([[21000, undefined, 44196]]);
      expect(getRangeValues(model, "Sheet2!A1:A3", sheet1Id)).toEqual([[21000, undefined, 44196]]);
      expect(getRangeValues(model, "B2", sheet1Id)).toEqual([[true]]);
      expect(getRangeValues(model, "Sheet1!B2", sheet1Id)).toEqual([[true]]);
      expect(getRangeValues(model, "Sheet2!B2", sheet2Id)).toEqual([[true]]);
      expect(getRangeValues(model, "Sheet2!B2", sheet1Id)).toEqual([[true]]);
      expect(getRangeValues(model, "B2", "invalidSheetId")).toEqual([[]]);
    });
  });
});
