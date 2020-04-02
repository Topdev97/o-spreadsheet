import { GridModel } from "../../src/model";
import "../canvas.mock";

describe("styles", () => {
  test("can undo and redo a setStyle operation on an empty cell", () => {
    const model = new GridModel();
    model.dispatch({ type: "SELECT_CELL", col: 1, row: 0 });
    model.dispatch({
      type: "SET_FORMATTING",
      sheet: "Sheet1",
      target: model.getters.getSelectedZones(),
      style: { fillColor: "red" }
    });

    expect(model.workbook.cells.B1.content).toBe("");
    expect(model.workbook.cells.B1.style).toBeDefined();
    model.dispatch({ type: "UNDO" });
    expect(model.workbook.cells.B1).not.toBeDefined();
  });

  test("can undo and redo a setStyle operation on an non empty cell", () => {
    const model = new GridModel();
    model.dispatch({ type: "SET_VALUE", xc: "B1", text: "some content" });
    model.dispatch({ type: "SELECT_CELL", col: 1, row: 0 });
    model.dispatch({
      type: "SET_FORMATTING",
      sheet: "Sheet1",
      target: model.getters.getSelectedZones(),
      style: { fillColor: "red" }
    });
    expect(model.workbook.cells.B1.content).toBe("some content");
    expect(model.workbook.cells.B1.style).toBeDefined();
    model.dispatch({ type: "UNDO" });
    expect(model.workbook.cells.B1.content).toBe("some content");
    expect(model.workbook.cells.B1.style).not.toBeDefined();
  });

  test("can clear formatting (style)", () => {
    const model = new GridModel();
    model.dispatch({ type: "SET_VALUE", xc: "B1", text: "b1" });
    model.dispatch({ type: "SELECT_CELL", col: 1, row: 0 });
    model.dispatch({
      type: "SET_FORMATTING",
      sheet: "Sheet1",
      target: model.getters.getSelectedZones(),
      style: { fillColor: "red" }
    });
    expect(model.workbook.cells.B1.style).toBeDefined();
    model.dispatch({
      type: "CLEAR_FORMATTING",
      sheet: model.state.activeSheet,
      target: model.getters.getSelectedZones()
    });
    expect(model.workbook.cells.B1.content).toBe("b1");
    expect(model.workbook.cells.B1.style).not.toBeDefined();
  });

  test("clearing format on a cell with no content actually remove it", () => {
    const model = new GridModel();
    model.dispatch({ type: "SELECT_CELL", col: 1, row: 0 });
    model.dispatch({
      type: "SET_FORMATTING",
      sheet: "Sheet1",
      target: model.getters.getSelectedZones(),
      style: { fillColor: "red" }
    });
    expect(model.workbook.cells.B1.style).toBeDefined();
    model.dispatch({
      type: "CLEAR_FORMATTING",
      sheet: model.state.activeSheet,
      target: model.getters.getSelectedZones()
    });
    expect(model.workbook.cells.B1).not.toBeDefined();
  });

  test("clearing format operation can be undone", () => {
    const model = new GridModel();
    model.dispatch({ type: "SET_VALUE", xc: "B1", text: "b1" });
    model.dispatch({ type: "SELECT_CELL", col: 1, row: 0 });
    model.dispatch({
      type: "SET_FORMATTING",
      sheet: "Sheet1",
      target: model.getters.getSelectedZones(),
      style: { fillColor: "red" }
    });
    expect(model.workbook.cells.B1.style).toBeDefined();
    model.dispatch({
      type: "CLEAR_FORMATTING",
      sheet: model.state.activeSheet,
      target: model.getters.getSelectedZones()
    });
    expect(model.workbook.cells.B1.style).not.toBeDefined();
    model.dispatch({ type: "UNDO" });
    expect(model.workbook.cells.B1.style).toBeDefined();
  });
});
