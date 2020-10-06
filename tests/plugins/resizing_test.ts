import { Model } from "../../src/model";
import "../canvas.mock";

describe("Model resizer", () => {
  test("Can resize one column, undo, then redo", async () => {
    const model = new Model();
    const sheet = model.getters.getActiveSheetId();
    const initialSize = model.getters.getCol(sheet, 1).size;
    const initialTop = model.getters.getCol(sheet, 2).start;
    const initialWidth = model.getters.getGridSize()[0];

    model.dispatch("RESIZE_COLUMNS", {
      sheetId: sheet,
      cols: [1],
      size: model.getters.getCol(sheet, 1).size + 100,
    });
    expect(model.getters.getCol(sheet, 1).size).toBe(196);
    expect(model.getters.getCol(sheet, 2).start).toBe(initialTop + 100);
    expect(model.getters.getGridSize()[0]).toBe(initialWidth + 100);

    model.dispatch("UNDO");
    expect(model.getters.getCol(sheet, 1).size).toBe(initialSize);
    expect(model.getters.getCol(sheet, 2).start).toBe(initialTop);
    expect(model.getters.getGridSize()[0]).toBe(initialWidth);

    model.dispatch("REDO");
    expect(model.getters.getCol(sheet, 1).size).toBe(initialSize + 100);
    expect(model.getters.getCol(sheet, 2).start).toBe(initialTop + 100);
    expect(model.getters.getGridSize()[0]).toBe(initialWidth + 100);
  });

  test("Can resize one row, then undo", async () => {
    const model = new Model();
    const sheet = model.getters.getActiveSheetId();
    const initialSize = model.getters.getRow(sheet, 1).size;
    const initialTop = model.getters.getRow(sheet, 2).start;
    const initialHeight = model.getters.getGridSize()[1];

    model.dispatch("RESIZE_ROWS", {
      sheetId: sheet,
      rows: [1],
      size: initialSize + 100,
    });
    expect(model.getters.getRow(sheet, 1).size).toBe(initialSize + 100);
    expect(model.getters.getRow(sheet, 2).start).toBe(initialTop + 100);
    expect(model.getters.getGridSize()[1]).toBe(initialHeight + 100);

    model.dispatch("UNDO");
    expect(model.getters.getRow(sheet, 1).size).toBe(initialSize);
    expect(model.getters.getRow(sheet, 2).start).toBe(initialTop);
    expect(model.getters.getGridSize()[1]).toBe(initialHeight);
  });

  test("Can resize row of inactive sheet", async () => {
    const model = new Model();
    model.dispatch("CREATE_SHEET", { sheetId: "42" });
    const [, sheet2] = model.getters.getSheets();
    model.dispatch("RESIZE_ROWS", { sheetId: sheet2.id, size: 42, rows: [0] });
    expect(model.getters.getActiveSheetId()).not.toBe(sheet2.id);
    expect(model.getters.getRow(sheet2.id, 0)).toEqual({
      cells: {},
      end: 42,
      size: 42,
      name: "1",
      start: 0,
    });
  });

  test("Can resize column of inactive sheet", async () => {
    const model = new Model();
    model.dispatch("CREATE_SHEET", { sheetId: "42" });
    const [, sheet2] = model.getters.getSheets();
    model.dispatch("RESIZE_COLUMNS", { sheetId: sheet2.id, size: 42, cols: [0] });
    expect(model.getters.getActiveSheetId()).not.toBe(sheet2.id);
    expect(model.getters.getCol(sheet2.id, 0)).toEqual({ end: 42, size: 42, name: "A", start: 0 });
  });

  test("changing sheets update the sizes", async () => {
    const model = new Model();
    model.dispatch("CREATE_SHEET", { activate: true, sheetId: "42" });
    const sheet1 = model.getters.getVisibleSheets()[0];
    const sheet2 = model.getters.getVisibleSheets()[1];

    expect(model.getters.getActiveSheetId()).toBe(sheet2);

    model.dispatch("RESIZE_COLUMNS", {
      sheetId: sheet2,
      cols: [1],
      size: model.getters.getCol(sheet2, 1).size + 100,
    });

    const initialWidth = model.getters.getGridSize()[0];

    model.dispatch("ACTIVATE_SHEET", { sheetIdFrom: sheet2, sheetIdTo: sheet1 });
    expect(model.getters.getGridSize()[0]).toBe(initialWidth - 100);
  });

  test("Can resize multiple columns", async () => {
    const model = new Model();
    const sheet = model.getters.getActiveSheetId();
    const size = model.getters.getCol(sheet, 0).size;

    model.dispatch("RESIZE_COLUMNS", {
      sheetId: model.getters.getActiveSheetId(),
      cols: [1, 3, 4],
      size: 100,
    });
    expect(model.getters.getCol(sheet, 1).size).toBe(100);
    expect(model.getters.getCol(sheet, 2).size).toBe(size);
    expect(model.getters.getCol(sheet, 3).size).toBe(100);
    expect(model.getters.getCol(sheet, 4).size).toBe(100);
    expect(model.getters.getCol(sheet, 5).start).toBe(size * 2 + 100 * 3);
  });

  test("Can resize multiple rows", async () => {
    const model = new Model();
    const sheet = model.getters.getActiveSheetId();
    const size = model.getters.getRow(sheet, 0).size;

    model.dispatch("RESIZE_ROWS", {
      sheetId: model.getters.getActiveSheetId(),
      rows: [1, 3, 4],
      size: 100,
    });

    expect(model.getters.getRow(sheet, 1).size).toBe(100);
    expect(model.getters.getRow(sheet, 2).size).toBe(size);
    expect(model.getters.getRow(sheet, 3).size).toBe(100);
    expect(model.getters.getRow(sheet, 4).size).toBe(100);
    expect(model.getters.getRow(sheet, 5).start).toBe(2 * size + 100 * 3);
  });

  test("resizing cols/rows update the total width/height", async () => {
    const model = new Model();

    const [initialWidth, initialHeight] = model.getters.getGridSize();
    const sheet = model.getters.getActiveSheetId();
    model.dispatch("RESIZE_COLUMNS", {
      sheetId: model.getters.getActiveSheetId(),
      cols: [1],
      size: model.getters.getCol(sheet, 1).size + 100,
    });
    expect(model.getters.getGridSize()[0]).toBe(initialWidth + 100);

    model.dispatch("RESIZE_ROWS", {
      sheetId: model.getters.getActiveSheetId(),
      rows: [1],
      size: model.getters.getRow(sheet, 1).size + 42,
    });
    expect(model.getters.getGridSize()[1]).toBe(initialHeight + 42);
  });
});
