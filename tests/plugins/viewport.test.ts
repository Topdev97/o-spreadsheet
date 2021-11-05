import { CommandResult } from "../../src";
import {
  DEFAULT_CELL_HEIGHT,
  DEFAULT_CELL_WIDTH,
  HEADER_HEIGHT,
  HEADER_WIDTH,
} from "../../src/constants";
import { numberToLetters, range, toXC, toZone, zoneToXc } from "../../src/helpers";
import { Model } from "../../src/model";
import {
  activateSheet,
  addColumns,
  addRows,
  deleteColumns,
  deleteRows,
  hideColumns,
  hideRows,
  merge,
  redo,
  resizeColumns,
  resizeRows,
  selectCell,
  setSelection,
  undo,
} from "../test_helpers/commands_helpers";

let model: Model;

describe("Viewport of Simple sheet", () => {
  beforeEach(async () => {
    model = new Model();
  });

  test("Select cell correctly affects offset", () => {
    // Since we rely on the adjustViewportPosition function here, the offsets will be linear combinations of the cells width and height
    selectCell(model, "P1");
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 42,
      left: 7,
      right: 16,
      offsetX: 7 * DEFAULT_CELL_WIDTH,
      offsetY: 0,
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );
    selectCell(model, "A79");
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 37,
      bottom: 79,
      left: 0,
      right: 9,
      offsetX: 0,
      offsetY: 37 * DEFAULT_CELL_HEIGHT,
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );
    // back to topleft
    selectCell(model, "A1");
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 42,
      left: 0,
      right: 9,
      offsetX: 0,
      offsetY: 0,
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );
    selectCell(model, "U51");
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 9,
      bottom: 51,
      left: 12,
      right: 21,
      offsetX: 12 * DEFAULT_CELL_WIDTH,
      offsetY: 9 * DEFAULT_CELL_HEIGHT,
    });
  });
  test("Can Undo/Redo action that alters viewport structure (add/delete rows or cols)", () => {
    model.getters.getActiveViewport();
    addRows(model, "before", 0, 70);
    selectCell(model, "B170");
    expect(model.getters.getActiveSnappedViewport()).toMatchObject({
      left: 0,
      right: 9,
      top: 128,
      bottom: 169,
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 128,
    });
    undo(model);
    expect(model.getters.getActiveSnappedViewport()).toMatchObject({
      left: 0,
      right: 9,
      top: 58,
      bottom: 99,
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 58,
    });
    redo(model); // should not alter offset
    expect(model.getters.getActiveSnappedViewport()).toMatchObject({
      left: 0,
      right: 9,
      top: 58,
      bottom: 100,
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 58,
    });
  });

  test("Add columns doesn't affect offset", () => {
    selectCell(model, "P1");
    const currentViewport = model.getters.getActiveViewport();
    addColumns(model, "after", "P", 30);
    expect(model.getters.getActiveViewport()).toMatchObject(currentViewport);
    undo(model);
    expect(model.getters.getActiveViewport()).toMatchObject(currentViewport);
    addColumns(model, "before", "P", 30);
    expect(model.getters.getActiveViewport()).toMatchObject(currentViewport);
  });
  test("Add rows doesn't affect offset", () => {
    selectCell(model, "A51");
    const currentViewport = model.getters.getActiveViewport();
    addRows(model, "after", 50, 30);
    expect(model.getters.getActiveViewport()).toMatchObject(currentViewport);
    undo(model);
    expect(model.getters.getActiveViewport()).toMatchObject(currentViewport);
    addRows(model, "before", 50, 30);
    expect(model.getters.getActiveViewport()).toMatchObject(currentViewport);
  });

  test("Horizontal scroll correctly affects offset", () => {
    model.dispatch("SET_VIEWPORT_OFFSET", {
      offsetX: DEFAULT_CELL_WIDTH * 2,
      offsetY: 0,
    });
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 42,
      left: 2,
      right: 11,
      offsetX: DEFAULT_CELL_WIDTH * 2,
      offsetY: 0,
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );
    model.dispatch("SET_VIEWPORT_OFFSET", {
      offsetX: DEFAULT_CELL_WIDTH * 17,
      offsetY: 0,
    });
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 42,
      left: 17,
      right: 25,
      offsetX: DEFAULT_CELL_WIDTH * 17,
      offsetY: 0,
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );
    model.dispatch("SET_VIEWPORT_OFFSET", {
      offsetX: DEFAULT_CELL_WIDTH * 12.5,
      offsetY: 0,
    });
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 42,
      left: 12,
      right: 22,
      offsetX: DEFAULT_CELL_WIDTH * 12.5,
      offsetY: 0,
    });
    expect(model.getters.getActiveSnappedViewport()).toMatchObject({
      top: 0,
      bottom: 42,
      left: 12,
      right: 21,
      offsetX: DEFAULT_CELL_WIDTH * 12,
      offsetY: 0,
    });
  });

  test("Vertical scroll correctly affects offset", () => {
    model.dispatch("SET_VIEWPORT_OFFSET", {
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 2,
    });
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 2,
      bottom: 44,
      left: 0,
      right: 9,
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 2,
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );
    model.dispatch("SET_VIEWPORT_OFFSET", {
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 57,
    });
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 57,
      bottom: 99,
      left: 0,
      right: 9,
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 57,
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );
    model.dispatch("SET_VIEWPORT_OFFSET", {
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 12.5,
    });
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 12,
      bottom: 54,
      left: 0,
      right: 9,
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 12.5,
    });
    expect(model.getters.getActiveSnappedViewport()).toMatchObject({
      top: 12,
      bottom: 54,
      left: 0,
      right: 9,
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 12,
    });
  });

  test("cannot set offset outside of the grid", () => {
    // negative
    const negativeOffsetResult = model.dispatch("SET_VIEWPORT_OFFSET", {
      offsetX: -1,
      offsetY: 0,
    });
    expect(negativeOffsetResult).toBeCancelledBecause(CommandResult.InvalidOffset);

    // too large
    model.dispatch("RESIZE_VIEWPORT", { height: 1000, width: 1000 });
    const { height } = model.getters.getGridDimension(model.getters.getActiveSheet());

    const tooLargeOffsetResult = model.dispatch("SET_VIEWPORT_OFFSET", {
      offsetX: 0,
      offsetY: height + HEADER_HEIGHT - 1000 + 1,
    });
    expect(tooLargeOffsetResult).toBeCancelledBecause(CommandResult.InvalidOffset);
  });

  test("Resize (increase) columns correctly affects viewport without changing the offset", () => {
    const { cols } = model.getters.getActiveSheet();
    model.dispatch("SET_VIEWPORT_OFFSET", {
      offsetX: DEFAULT_CELL_WIDTH * 2,
      offsetY: 0,
    });
    const { offsetX } = model.getters.getActiveViewport();
    resizeColumns(
      model,
      [...Array(cols.length).keys()].map(numberToLetters),
      DEFAULT_CELL_WIDTH * 2
    );
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 42,
      left: 1,
      right: 5,
      offsetX: offsetX,
      offsetY: 0,
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );
  });

  test("Resize (reduce) columns correctly changes offset", () => {
    const { cols } = model.getters.getActiveSheet();
    //scroll max
    selectCell(model, "Z1");
    model.dispatch("SELECT_ALL");

    resizeColumns(
      model,
      [...Array(cols.length).keys()].map(numberToLetters),
      DEFAULT_CELL_WIDTH / 2
    );
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 42,
      left: 8,
      right: 25,
    });
    expect(model.getters.getActiveSnappedViewport()).toMatchObject({
      top: 0,
      bottom: 42,
      left: 8,
      right: 25,
      offsetX: (DEFAULT_CELL_WIDTH / 2) * 8,
      offsetY: 0,
    });
  });

  test("Resize rows correctly affects viewport without changing the offset", () => {
    const { rows } = model.getters.getActiveSheet();
    model.dispatch("SET_VIEWPORT_OFFSET", {
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 2,
    });
    const { offsetY } = model.getters.getActiveViewport();
    resizeRows(model, [...Array(rows.length).keys()], DEFAULT_CELL_HEIGHT * 2);
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 1,
      bottom: 22,
      left: 0,
      right: 9,
      offsetX: 0,
      offsetY: offsetY,
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );
  });

  test("Resize (reduce) rows correctly changes offset", () => {
    const { rows } = model.getters.getActiveSheet();
    //scroll max
    selectCell(model, "A100");
    model.dispatch("SELECT_ALL");
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 58,
      bottom: 99,
      left: 0,
      right: 9,
    });
    resizeRows(model, [...Array(rows.length).keys()], DEFAULT_CELL_HEIGHT / 2);
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 17,
      bottom: 99,
      left: 0,
      right: 9,
    });
    expect(model.getters.getActiveSnappedViewport()).toMatchObject({
      top: 17,
      bottom: 99,
      left: 0,
      right: 9,
      offsetX: 0,
      offsetY: (DEFAULT_CELL_HEIGHT / 2) * 17,
    });
  });

  test("Hide/unhide Columns from leftest column", () => {
    hideColumns(model, [0, 1, 2, 4, 5].map(numberToLetters)); // keep 3
    expect(model.getters.getActiveSnappedViewport()).toMatchObject({
      top: 0,
      bottom: 42,
      left: 3,
      right: 14,
      offsetX: 0,
      offsetY: 0,
    });
  });

  test("Hide/unhide Columns from rightest column", () => {
    selectCell(model, "Z1");
    const viewport = model.getters.getActiveViewport();
    expect(model.getters.getActiveSnappedViewport()).toMatchObject(viewport);
    hideColumns(model, [...Array(26).keys()].slice(13).map(numberToLetters));
    expect(model.getters.getActiveSnappedViewport()).toMatchObject({
      top: viewport.top,
      bottom: viewport.bottom,
      left: 4,
      right: viewport.right,
      offsetX: DEFAULT_CELL_WIDTH * 4,
      offsetY: 0,
    });
  });
  test("Hide/unhide Row from top row", () => {
    hideRows(model, [0, 1, 2, 4, 5]); // keep 3
    expect(model.getters.getActiveSnappedViewport()).toMatchObject({
      top: 3,
      bottom: 47,
      left: 0,
      right: 9,
      offsetX: 0,
      offsetY: 0,
    });
  });
  test("Hide/unhide Rows from bottom row", () => {
    selectCell(model, "A100");
    const viewport = model.getters.getActiveViewport();
    expect(model.getters.getActiveSnappedViewport()).toMatchObject(viewport);
    hideRows(model, [...Array(100).keys()].slice(60));
    expect(model.getters.getActiveSnappedViewport()).toMatchObject({
      top: 18,
      bottom: 99,
      left: viewport.left,
      right: viewport.right,
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 18,
    });
  });
  test("Horizontally move position to top right then back to top left correctly affects offset", () => {
    const { right } = model.getters.getActiveViewport();
    selectCell(model, toXC(right - 1, 0));
    model.dispatch("MOVE_POSITION", { deltaX: 1, deltaY: 0 });
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 42,
      left: 1,
      right: 10,
      offsetX: DEFAULT_CELL_WIDTH,
      offsetY: 0,
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );
    model.dispatch("MOVE_POSITION", { deltaX: 1, deltaY: 0 });
    model.dispatch("MOVE_POSITION", { deltaX: 1, deltaY: 0 });
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 42,
      left: 3,
      right: 12,
      offsetX: DEFAULT_CELL_WIDTH * 3,
      offsetY: 0,
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );

    const { left } = model.getters.getActiveSnappedViewport();
    selectCell(model, toXC(left, 0));
    model.dispatch("MOVE_POSITION", { deltaX: -1, deltaY: 0 });
    model.dispatch("MOVE_POSITION", { deltaX: -1, deltaY: 0 });
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 42,
      left: 1,
      right: 10,
      offsetX: DEFAULT_CELL_WIDTH,
      offsetY: 0,
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );
  });

  test("Vertically move position to bottom left then back to top left correctly affects offset", () => {
    const { bottom } = model.getters.getActiveViewport();
    selectCell(model, toXC(0, bottom - 1));
    model.dispatch("MOVE_POSITION", { deltaX: 0, deltaY: 1 });
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 1,
      bottom: 43,
      left: 0,
      right: 9,
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT,
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );
    model.dispatch("MOVE_POSITION", { deltaX: 0, deltaY: 1 });
    model.dispatch("MOVE_POSITION", { deltaX: 0, deltaY: 1 });
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 3,
      bottom: 45,
      left: 0,
      right: 9,
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 3,
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );
    const { top } = model.getters.getActiveViewport();
    selectCell(model, toXC(0, top));
    model.dispatch("MOVE_POSITION", { deltaX: 0, deltaY: -1 });
    model.dispatch("MOVE_POSITION", { deltaX: 0, deltaY: -1 });
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 1,
      bottom: 43,
      left: 0,
      right: 9,
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT,
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );
  });

  test("Move position on cells that are taller than the client's height", () => {
    const { height } = model.getters.getViewportDimension();
    resizeRows(model, [0], height + 50);
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 0,
      left: 0,
      right: 9,
      offsetX: 0,
      offsetY: 0,
    });
    model.dispatch("MOVE_POSITION", { deltaX: 0, deltaY: 1 });
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 1,
      bottom: 43,
      left: 0,
      right: 9,
      offsetX: 0,
      offsetY: height + 50, // row1 + row2
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );
  });

  test("Move position on cells wider than the client's width", () => {
    const { width } = model.getters.getViewportDimension();
    resizeColumns(model, ["A"], width + 50);
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 42,
      left: 0,
      right: 0,
      offsetX: 0,
      offsetY: 0,
    });
    model.dispatch("MOVE_POSITION", { deltaX: 1, deltaY: 0 });
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 42,
      left: 1,
      right: 10,
      offsetX: width + 50, // colA + colB
      offsetY: 0,
    });
    expect(model.getters.getActiveViewport()).toMatchObject(
      model.getters.getActiveSnappedViewport()
    );
  });
  test("Select Column while updating range does not update viewport", () => {
    selectCell(model, "C51");
    const viewport = model.getters.getActiveViewport();
    model.dispatch("SELECT_COLUMN", { index: 3 });
    expect(model.getters.getActiveViewport()).toMatchObject(viewport);
  });
  test("Select Row does not update viewport", () => {
    selectCell(model, "U5");
    const viewport = model.getters.getActiveViewport();
    model.dispatch("SELECT_ROW", { index: 3 });
    expect(model.getters.getActiveViewport()).toMatchObject(viewport);
  });
  test("Resize Viewport is correctly computed and does not adjust position", () => {
    selectCell(model, "K71");
    model.dispatch("SET_VIEWPORT_OFFSET", { offsetX: 100, offsetY: 112 });
    const viewport = model.getters.getActiveSnappedViewport();
    model.dispatch("RESIZE_VIEWPORT", {
      width: 500,
      height: 500,
    });
    expect(model.getters.getActiveSnappedViewport()).toMatchObject({
      ...viewport,
      bottom: viewport.top + Math.ceil((500 - HEADER_HEIGHT) / DEFAULT_CELL_HEIGHT) - 1,
      right: viewport.left + Math.ceil((500 - HEADER_WIDTH) / DEFAULT_CELL_WIDTH) - 1,
    });
  });

  test("Resizing the viewport impacts current Offset", () => {
    // set coherent size and offset limit
    model.dispatch("RESIZE_VIEWPORT", {
      width: 1000,
      height: 1000,
    });
    let { width: gridWidth, height: gridHeight } = model.getters.getGridDimension(
      model.getters.getActiveSheet()
    );
    let { width, height } = model.getters.getViewportDimension();
    model.dispatch("SET_VIEWPORT_OFFSET", {
      offsetX: gridWidth - width + HEADER_WIDTH,
      offsetY: gridHeight - height + HEADER_HEIGHT,
    });
    // de-zoom
    model.dispatch("RESIZE_VIEWPORT", {
      width: 1250,
      height: 1250,
    });
    ({ width, height } = model.getters.getViewportDimension());
    ({ width: gridWidth, height: gridHeight } = model.getters.getGridDimension(
      model.getters.getActiveSheet()
    ));

    expect(model.getters.getActiveViewport()).toMatchObject({
      offsetX: gridWidth - width + HEADER_WIDTH,
      offsetY: gridHeight - height + HEADER_HEIGHT,
    });
  });
});

describe("multi sheet with different sizes", () => {
  beforeEach(async () => {
    model = new Model({
      sheets: [
        {
          name: "small",
          id: "small",
          colNumber: 2,
          rowNumber: 2,
          cells: {},
        },
        {
          name: "big",
          id: "big",
          colNumber: 5,
          rowNumber: 5,
          cells: {},
        },
      ],
    });
  });

  test("viewports of multiple sheets of different size are correctly computed", () => {
    activateSheet(model, "small");
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 1,
      left: 0,
      right: 1,
      offsetX: 0,
      offsetY: 0,
    });
    activateSheet(model, "big");
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 4,
      left: 0,
      right: 4,
      offsetX: 0,
      offsetY: 0,
    });
  });

  test("deleting the column that has the active cell doesn't crash", () => {
    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("small");
    selectCell(model, "B2");
    deleteColumns(model, ["B"]);
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 1,
      left: 0,
      right: 0,
    });
    expect(model.getters.getActiveCell()).toBeUndefined();
  });

  test("deleting the row that has the active cell doesn't crash", () => {
    expect(model.getters.getSheetName(model.getters.getActiveSheetId())).toBe("small");
    selectCell(model, "B2");
    deleteRows(model, [1]);
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 0,
      left: 0,
      right: 1,
    });
    expect(model.getters.getActiveCell()).toBeUndefined();
  });

  test("Client resize impacts all sheets", () => {
    model.dispatch("RESIZE_VIEWPORT", {
      width: 2.5 * DEFAULT_CELL_WIDTH + HEADER_WIDTH, // concretely 2.5 cells visible
      height: 3.5 * DEFAULT_CELL_HEIGHT + HEADER_HEIGHT, // concretely 3.5 cells visible
    });
    activateSheet(model, "small");
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 1,
      left: 0,
      right: 1,
    });
    activateSheet(model, "big");
    expect(model.getters.getActiveViewport()).toMatchObject({
      top: 0,
      bottom: 3,
      left: 0,
      right: 2,
    });
  });
  test("can undo/redo actions on other sheets", () => {
    activateSheet(model, "small");
    addColumns(model, "after", "A", 200);
    selectCell(model, toXC(200, 0));
    activateSheet(model, "big");
    undo(model);
  });
});

describe("shift viewport up/down", () => {
  beforeEach(() => {
    model = new Model();
  });

  test("basic move viewport", () => {
    const { bottom } = model.getters.getActiveSnappedViewport();
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getActiveSnappedViewport().top).toBe(bottom);
    model.dispatch("SHIFT_VIEWPORT_UP");
    expect(model.getters.getActiveSnappedViewport().top).toBe(0);
  });

  test("move viewport with non-default size", () => {
    model.dispatch("RESIZE_VIEWPORT", {
      height: 100,
      width: 100,
    });
    const { bottom } = model.getters.getActiveSnappedViewport();
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getActiveSnappedViewport().top).toBe(bottom);
    model.dispatch("SHIFT_VIEWPORT_UP");
    expect(model.getters.getActiveSnappedViewport().top).toBe(0);
  });

  test("RENAME move viewport not starting from the top", () => {
    selectCell(model, "A4");
    const { bottom } = model.getters.getActiveSnappedViewport();
    model.dispatch("SET_VIEWPORT_OFFSET", {
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 3,
    });
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getActiveSnappedViewport().top).toBe(bottom + 3);
    model.dispatch("SHIFT_VIEWPORT_UP");
    expect(model.getters.getActiveSnappedViewport().top).toBe(3);
  });

  test("RENAME move viewport not starting from the top", () => {
    selectCell(model, "A4");
    const { bottom } = model.getters.getActiveSnappedViewport();
    model.dispatch("SET_VIEWPORT_OFFSET", {
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 3 + 1,
    });
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getActiveSnappedViewport().top).toBe(bottom + 3);
    model.dispatch("SHIFT_VIEWPORT_UP");
    expect(model.getters.getActiveSnappedViewport().top).toBe(3);
  });

  test("RENAME move viewport not starting from the top", () => {
    selectCell(model, "A4");
    const { bottom } = model.getters.getActiveSnappedViewport();
    model.dispatch("SET_VIEWPORT_OFFSET", {
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 3 - 1,
    });
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getActiveSnappedViewport().top).toBe(bottom + 2);
    model.dispatch("SHIFT_VIEWPORT_UP");
    expect(model.getters.getActiveSnappedViewport().top).toBe(2);
  });

  test("move all the way down and up again", () => {
    const sheetId = model.getters.getActiveSheetId();
    const numberOfRows = model.getters.getNumberRows(sheetId);
    let { bottom } = model.getters.getActiveSnappedViewport();
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getActiveSnappedViewport().top).toBe(bottom);
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getActiveSnappedViewport().bottom).toBe(numberOfRows - 1);
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getActiveSnappedViewport().bottom).toBe(numberOfRows - 1);

    let { top } = model.getters.getActiveSnappedViewport();
    model.dispatch("SHIFT_VIEWPORT_UP");
    expect(model.getters.getActiveSnappedViewport().bottom).toBe(top);
    model.dispatch("SHIFT_VIEWPORT_UP");
    expect(model.getters.getActiveSnappedViewport().top).toBe(0);
    model.dispatch("SHIFT_VIEWPORT_UP");
    expect(model.getters.getActiveSnappedViewport().top).toBe(0);
  });

  test("move viewport does not changes its dimension", () => {
    const viewportDimension = model.getters.getViewportDimension();
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getViewportDimension()).toEqual(viewportDimension);
    model.dispatch("SHIFT_VIEWPORT_UP");
    expect(model.getters.getViewportDimension()).toEqual(viewportDimension);
  });

  test("X offset does not change", () => {
    selectCell(model, "D1");
    model.dispatch("SET_VIEWPORT_OFFSET", {
      offsetX: DEFAULT_CELL_WIDTH * 3,
      offsetY: 0,
    });
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getActiveSnappedViewport().offsetX).toBe(DEFAULT_CELL_WIDTH * 3);
    model.dispatch("SHIFT_VIEWPORT_UP");
    expect(model.getters.getActiveSnappedViewport().offsetX).toBe(DEFAULT_CELL_WIDTH * 3);
  });

  test("anchor cell at the viewport top is shifted", () => {
    const { bottom } = model.getters.getActiveSnappedViewport();
    selectCell(model, "A1");
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getSelectedZones()).toHaveLength(1);
    expect(model.getters.getSelectedZone()).toEqual({ top: bottom, bottom, left: 0, right: 0 });
    model.dispatch("SHIFT_VIEWPORT_UP");
    expect(model.getters.getSelectedZones()).toHaveLength(1);
    expect(model.getters.getSelectedZone()).toEqual(toZone("A1"));
  });

  test("anchor cell not at the viewport top is shifted", () => {
    const { bottom } = model.getters.getActiveSnappedViewport();
    selectCell(model, "B4");
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getSelectedZone()).toEqual({
      top: bottom + 3,
      bottom: bottom + 3,
      left: 1,
      right: 1,
    });
    model.dispatch("SHIFT_VIEWPORT_UP");
    expect(model.getters.getSelectedZone()).toEqual(toZone("B4"));
  });

  test("only anchor cell is kept (and shifted) when moving the viewport", () => {
    setSelection(model, ["A1:A2", "B5", "D1:D2"], {
      anchor: "D1",
    });
    const { bottom } = model.getters.getActiveSnappedViewport();
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getSelectedZones()).toHaveLength(1);
    expect(model.getters.getSelectedZone()).toEqual({
      top: bottom,
      bottom,
      left: 3,
      right: 3,
    });
  });

  test("hidden rows are skipped", () => {
    const { bottom } = model.getters.getActiveSnappedViewport();
    model.dispatch("HIDE_COLUMNS_ROWS", {
      dimension: "ROW",
      elements: [2, 3, 4],
      sheetId: model.getters.getActiveSheetId(),
    });
    const { bottom: bottomWithHiddenRows } = model.getters.getActiveSnappedViewport();
    expect(bottomWithHiddenRows).toBe(bottom + 3);
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getActiveSnappedViewport().top).toBe(bottomWithHiddenRows);
    model.dispatch("SHIFT_VIEWPORT_UP");
    expect(model.getters.getActiveSnappedViewport().bottom).toBe(bottomWithHiddenRows);
  });

  test("bottom cell is in a merge and new anchor in the merge", () => {
    const { bottom } = model.getters.getActiveSnappedViewport();
    const mergeTop = bottom - 1;
    const mergeBottom = bottom + 1;
    merge(
      model,
      zoneToXc({
        top: mergeTop,
        bottom: mergeBottom,
        left: 0,
        right: 0,
      })
    );
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getActiveSnappedViewport().top).toBe(mergeTop);
    model.dispatch("SHIFT_VIEWPORT_UP");
    expect(model.getters.getActiveSnappedViewport().bottom).toBe(bottom);
  });

  test("bottom cell is in a merge and new anchor *not* in the merge", () => {
    const { bottom } = model.getters.getActiveSnappedViewport();
    const mergeTop = bottom - 1;
    const mergeBottom = bottom + 1;
    merge(
      model,
      zoneToXc({
        top: mergeTop,
        bottom: mergeBottom,
        left: 0,
        right: 0,
      })
    );
    selectCell(model, "B1");
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getActiveSnappedViewport().top).toBe(bottom);
  });

  test("anchor ends up at the last row", () => {
    const { bottom } = model.getters.getActiveSnappedViewport();
    const sheetId = model.getters.getActiveSheetId();
    model.dispatch("RESIZE_VIEWPORT", {
      width: 1000,
      height: bottom * DEFAULT_CELL_HEIGHT,
    });
    deleteRows(model, range(bottom + 1, model.getters.getNumberRows(sheetId)));
    selectCell(model, toXC(0, bottom));
    expect(model.getters.getActiveSnappedViewport().bottom).toBe(bottom);
    model.dispatch("SHIFT_VIEWPORT_DOWN");
    expect(model.getters.getSelectedZone()).toEqual({
      top: bottom,
      bottom: model.getters.getNumberRows(sheetId) - 1,
      left: 0,
      right: 0,
    });
  });

  test.each(["A1", "A2"])(
    "viewport and selection %s do not move when its already the end of the sheet",
    (selectedCell) => {
      const sheetId = model.getters.getActiveSheetId();
      // delete all rows except the first two ones
      deleteRows(model, range(2, model.getters.getNumberRows(sheetId)));
      selectCell(model, selectedCell);
      model.dispatch("SHIFT_VIEWPORT_DOWN");
      expect(model.getters.getActiveSnappedViewport().top).toBe(0);
      expect(model.getters.getSelectedZone()).toEqual(toZone(selectedCell));
      model.dispatch("SHIFT_VIEWPORT_UP");
      expect(model.getters.getActiveSnappedViewport().top).toBe(0);
      expect(model.getters.getSelectedZone()).toEqual(toZone(selectedCell));
    }
  );

  test.each(["A1", "A2", "A15"])(
    "anchor %s is shifted by the correct amount when the sheet end is reached",
    (selectedCell) => {
      const { bottom } = model.getters.getActiveSnappedViewport();
      const sheetId = model.getters.getActiveSheetId();
      // delete all rows after the viewport except three
      deleteRows(model, range(bottom + 3, model.getters.getNumberRows(sheetId)));
      selectCell(model, selectedCell);
      model.dispatch("SHIFT_VIEWPORT_DOWN");
      expect(model.getters.getSelectedZone()).toEqual({
        top: toZone(selectedCell).top + 3,
        bottom: toZone(selectedCell).bottom + 3,
        left: 0,
        right: 0,
      });
      model.dispatch("SHIFT_VIEWPORT_UP");
      expect(model.getters.getSelectedZone()).toEqual(toZone(selectedCell));
    }
  );
});
