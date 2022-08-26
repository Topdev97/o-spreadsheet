import {
  BACKGROUND_HEADER_ACTIVE_COLOR,
  BACKGROUND_HEADER_FILTER_COLOR,
  BACKGROUND_HEADER_SELECTED_COLOR,
  BACKGROUND_HEADER_SELECTED_FILTER_COLOR,
  DEFAULT_CELL_HEIGHT,
  FILTERS_COLOR,
  HEADER_HEIGHT,
  HEADER_WIDTH,
  MIN_CF_ICON_MARGIN,
  SELECTION_BORDER_COLOR,
} from "../../src/constants";
import { fontSizeMap } from "../../src/fonts";
import { toZone } from "../../src/helpers";
import { Mode, Model } from "../../src/model";
import {
  CELL_BACKGROUND_GRIDLINE_STROKE_STYLE,
  RendererPlugin,
} from "../../src/plugins/ui/renderer";
import { Align, BorderCommand, Box, GridRenderingContext, Viewport, Zone } from "../../src/types";
import { MockCanvasRenderingContext2D } from "../setup/canvas.mock";
import {
  addColumns,
  copy,
  createFilter,
  deleteColumns,
  merge,
  paste,
  resizeColumns,
  resizeRows,
  setBorder,
  setCellContent,
  setSelection,
  setStyle,
} from "../test_helpers/commands_helpers";
import { createEqualCF, getPlugin, target, toRangesData } from "../test_helpers/helpers";
import { watchClipboardOutline } from "../test_helpers/renderer_helpers";
import { DEFAULT_CELL_WIDTH } from "./../../src/constants";

MockCanvasRenderingContext2D.prototype.measureText = function (text: string) {
  return { width: text.length };
};
jest.mock("../../src/helpers/uuid", () => require("../__mocks__/uuid"));

function getBoxFromText(model: Model, text: string): Box {
  const rendererPlugin = getPlugin(model, RendererPlugin);
  // @ts-ignore
  return (rendererPlugin.boxes as Box[]).find(
    (b) => (b.content?.multiLineText || []).join(" ") === text
  );
}

interface ContextObserver {
  onSet?(key, val): void;
  onGet?(key): void;
  onFunctionCall?(fn: string, args: any[], renderingContext: MockGridRenderingContext): void;
}

class MockGridRenderingContext implements GridRenderingContext {
  _context = document.createElement("canvas").getContext("2d");
  ctx: CanvasRenderingContext2D;
  viewport: Viewport;
  dpr = 1;
  thinLineWidth = 0.4;

  constructor(model: Model, width: number, height: number, observer: ContextObserver) {
    model.dispatch("RESIZE_SHEETVIEW", {
      width: width - HEADER_WIDTH,
      height: height - HEADER_HEIGHT,
      gridOffsetX: 0,
      gridOffsetY: 0,
    });
    this.viewport = model.getters.getActiveMainViewport();

    const handler = {
      get: (target, val) => {
        if (val in (this._context as any).__proto__) {
          return (...args) => {
            if (observer.onFunctionCall) {
              observer.onFunctionCall(val, args, this);
            }
          };
        } else {
          if (observer.onGet) {
            observer.onGet(val);
          }
        }
        return target[val];
      },
      set: (target, key, val) => {
        if (observer.onSet) {
          observer.onSet(key, val);
        }
        target[key] = val;
        return true;
      },
    };
    this.ctx = new Proxy({}, handler);
  }
}

describe("renderer", () => {
  test("snapshot for a simple grid rendering", () => {
    const model = new Model();

    setCellContent(model, "A1", "1");
    const instructions: string[] = [];
    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        instructions.push(`context.${key}=${JSON.stringify(value)};`);
      },
      onGet: (key) => {
        instructions.push(`GET:${key}`);
      },
      onFunctionCall: (key, args) => {
        instructions.push(`context.${key}(${args.map((a) => JSON.stringify(a)).join(", ")})`);
      },
    });

    model.drawGrid(ctx);
    expect(instructions).toMatchSnapshot();
  });

  describe("Headers background color", () => {
    function getFirstRowHeaderFillColor() {
      const index = instructions.findIndex(
        (instr) =>
          instr === `ctx.fillRect(${0}, ${HEADER_HEIGHT}, ${HEADER_WIDTH}, ${DEFAULT_CELL_HEIGHT})`
      );
      let instruction = instructions[index - 1];
      instruction = instruction.replace('ctx.fillStyle="', "");
      instruction = instruction.replace('";', "");
      return instruction;
    }

    function getFirstColHeaderFillColor() {
      const index = instructions.findIndex(
        (instr) =>
          instr === `ctx.fillRect(${HEADER_WIDTH}, ${0}, ${DEFAULT_CELL_WIDTH}, ${HEADER_HEIGHT})`
      );
      let instruction = instructions[index - 1];
      instruction = instruction.replace('ctx.fillStyle="', "");
      instruction = instruction.replace('";', "");
      return instruction;
    }

    let model: Model;
    let instructions: string[];
    let ctx: MockGridRenderingContext;
    beforeEach(() => {
      model = new Model({ sheets: [{ colNumber: 2, rowNumber: 2 }] });
      const { width, height } = model.getters.getSheetViewDimension();
      instructions = [];
      ctx = new MockGridRenderingContext(model, 1000, 1000, {
        onSet: (key, value) => {
          instructions.push(`ctx.${key}=${JSON.stringify(value)};`);
        },
        onGet: (key) => {
          instructions.push(`GET:${key}`);
        },
        onFunctionCall: (key, args) => {
          instructions.push(`ctx.${key}(${args.map((a) => JSON.stringify(a)).join(", ")})`);
        },
      });
      model.dispatch("RESIZE_SHEETVIEW", {
        width,
        height,
        gridOffsetX: HEADER_WIDTH,
        gridOffsetY: HEADER_HEIGHT,
      });
    });

    test("Color of headers containing the selection", () => {
      setSelection(model, ["A1"]);
      model.drawGrid(ctx);
      const fillColHeaderInstr = getFirstColHeaderFillColor();
      expect(fillColHeaderInstr).toEqual(BACKGROUND_HEADER_SELECTED_COLOR);
      const fillRowHeaderInstr = getFirstRowHeaderFillColor();
      expect(fillRowHeaderInstr).toEqual(BACKGROUND_HEADER_SELECTED_COLOR);
    });

    test("Color of active headers", () => {
      setSelection(model, ["A1:B2"]);
      model.drawGrid(ctx);
      const fillColHeaderInstr = getFirstColHeaderFillColor();
      expect(fillColHeaderInstr).toEqual(BACKGROUND_HEADER_ACTIVE_COLOR);
      const fillRowHeaderInstr = getFirstRowHeaderFillColor();
      expect(fillRowHeaderInstr).toEqual(BACKGROUND_HEADER_ACTIVE_COLOR);
    });

    test("Color of headers that contains a filter", () => {
      createFilter(model, "A1:B2");
      setSelection(model, ["B2"]); // by default the cell A1 was selected
      model.drawGrid(ctx);
      const fillColHeaderInstr = getFirstColHeaderFillColor();
      expect(fillColHeaderInstr).toEqual(BACKGROUND_HEADER_FILTER_COLOR);
      const fillRowHeaderInstr = getFirstRowHeaderFillColor();
      expect(fillRowHeaderInstr).toEqual(BACKGROUND_HEADER_FILTER_COLOR);
    });

    test("Color of headers that contain a filter + are selected", () => {
      createFilter(model, "A1:B2");
      setSelection(model, ["A1"]);
      model.drawGrid(ctx);
      const fillColHeaderInstr = getFirstColHeaderFillColor();
      expect(fillColHeaderInstr).toEqual(BACKGROUND_HEADER_SELECTED_FILTER_COLOR);
      const fillRowHeaderInstr = getFirstRowHeaderFillColor();
      expect(fillRowHeaderInstr).toEqual(BACKGROUND_HEADER_SELECTED_FILTER_COLOR);
    });

    test("Headers that contain a filter + are selected", () => {
      createFilter(model, "A1:B2");
      setSelection(model, ["A1"]);
      model.drawGrid(ctx);
      const fillColHeaderInstr = getFirstColHeaderFillColor();
      expect(fillColHeaderInstr).toEqual(BACKGROUND_HEADER_SELECTED_FILTER_COLOR);
      const fillRowHeaderInstr = getFirstRowHeaderFillColor();
      expect(fillRowHeaderInstr).toEqual(BACKGROUND_HEADER_SELECTED_FILTER_COLOR);
    });

    test("Headers that contain a filter + are active", () => {
      createFilter(model, "A1:B2");
      setSelection(model, ["A1:B2"]);
      model.drawGrid(ctx);
      const fillColHeaderInstr = getFirstColHeaderFillColor();
      expect(fillColHeaderInstr).toEqual(FILTERS_COLOR);
      const fillRowHeaderInstr = getFirstRowHeaderFillColor();
      expect(fillRowHeaderInstr).toEqual(FILTERS_COLOR);
    });
  });

  test("formulas evaluating to a string are properly aligned", () => {
    const model = new Model();

    setCellContent(model, "A1", "1");
    setCellContent(model, "A2", "=A1");

    let textAligns: string[] = [];
    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "textAlign") {
          textAligns.push(value);
        }
      },
    });

    model.drawGrid(ctx);
    expect(textAligns).toEqual(["right", "right", "center"]); // center for headers

    textAligns = [];
    setCellContent(model, "A1", "asdf");
    model.drawGrid(ctx);
    expect(textAligns).toEqual(["left", "left", "center"]); // center for headers
  });

  test("formulas referencing an empty cell are properly aligned", () => {
    const model = new Model();

    setCellContent(model, "A1", "=A2");

    let textAligns: string[] = [];
    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "textAlign") {
          textAligns.push(value);
        }
      },
    });

    model.drawGrid(ctx);
    expect(textAligns).toEqual(["right", "center"]); // center for headers
  });

  test("numbers are aligned right when overflowing vertically", () => {
    const model = new Model();

    setCellContent(model, "A1", "1");
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: target("A1"),
      style: { fontSize: 36 },
    });

    let textAligns: string[] = [];
    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "textAlign") {
          textAligns.push(value);
        }
      },
    });

    model.drawGrid(ctx);
    expect(textAligns).toEqual(["right", "center"]); // center for headers
  });

  test("Cells evaluating to a number are properly aligned on overflow", () => {
    const model = new Model({
      sheets: [
        {
          id: 1,
          cols: { 0: { size: 5 }, 2: { size: 25 } },
          colNumber: 3,
          cells: {
            A1: { content: "123456" },
            A2: { content: "=A1" },
            C1: { content: "123456" },
            C2: { content: "=C1" },
          },
          conditionalFormats: [
            {
              id: "1",
              ranges: ["C1:C2"],
              rule: {
                type: "IconSetRule",
                upperInflectionPoint: { type: "number", value: "1000", operator: "gt" },
                lowerInflectionPoint: { type: "number", value: "0", operator: "gt" },
                icons: {
                  upper: "arrowGood",
                  middle: "arrowNeutral",
                  lower: "arrowBad",
                },
              },
            },
          ],
        },
      ],
    });

    let textAligns: string[] = [];
    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "textAlign") {
          textAligns.push(value);
        }
      },
    });

    model.drawGrid(ctx);
    expect(textAligns).toEqual(["left", "left", "left", "left", "center"]); // A1-C1-A2-C2 and center for headers

    textAligns = [];
    setCellContent(model, "A1", "1");
    setCellContent(model, "C1", "1");
    model.drawGrid(ctx);
    expect(textAligns).toEqual(["right", "right", "right", "right", "center"]); // A1-C1-A2-C2 and center for headers
  });

  test("fillstyle of cell will be rendered", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 1,
          rowNumber: 3,
        },
      ],
    });
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: [toZone("A1")],
      style: { fillColor: "#DC6CDF" },
    });

    let fillStyle: any[] = [];
    let fillStyleColor1Called = false;
    let fillStyleColor2Called = false;
    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "fillStyle" && value === "#DC6CDF") {
          fillStyleColor1Called = true;
          fillStyleColor2Called = false;
        }
        if (key === "fillStyle" && value === "#DC6CDE") {
          fillStyleColor2Called = true;
          fillStyleColor1Called = false;
        }
      },
      onFunctionCall: (val, args) => {
        if (val === "fillRect" && fillStyleColor1Called) {
          fillStyle.push({ color: "#DC6CDF", x: args[0], y: args[1], w: args[2], h: args[3] });
          fillStyleColor1Called = false;
          fillStyleColor2Called = false;
        }
        if (val === "fillRect" && fillStyleColor2Called) {
          fillStyle.push({ color: "#DC6CDE", x: args[0], y: args[1], w: args[2], h: args[3] });
          fillStyleColor1Called = false;
          fillStyleColor2Called = false;
        }
      },
    });

    model.drawGrid(ctx);
    expect(fillStyle).toEqual([{ color: "#DC6CDF", h: 23, w: 96, x: 0, y: 0 }]);

    fillStyle = [];
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: [toZone("A1")],
      style: { fillColor: "#DC6CDE" },
    });
    model.drawGrid(ctx);
    expect(fillStyle).toEqual([{ color: "#DC6CDE", h: 23, w: 96, x: 0, y: 0 }]);
  });

  test("fillstyle of merge will be rendered for all cells in merge", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 1,
          rowNumber: 3,
        },
      ],
    });
    const sheetId = model.getters.getActiveSheetId();
    model.dispatch("SET_FORMATTING", {
      sheetId,
      target: [toZone("A1")],
      style: { fillColor: "#DC6CDF" },
    });
    merge(model, "A1:A3");

    let fillStyle: any[] = [];
    let fillStyleColor1Called = false;
    let fillStyleColor2Called = false;
    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "fillStyle" && value === "#DC6CDF") {
          fillStyleColor1Called = true;
          fillStyleColor2Called = false;
        }
        if (key === "fillStyle" && value === "#DC6CDE") {
          fillStyleColor2Called = true;
          fillStyleColor1Called = false;
        }
      },
      onFunctionCall: (val, args) => {
        if (val === "fillRect" && fillStyleColor1Called) {
          fillStyle.push({ color: "#DC6CDF", x: args[0], y: args[1], w: args[2], h: args[3] });
          fillStyleColor1Called = false;
          fillStyleColor2Called = false;
        }
        if (val === "fillRect" && fillStyleColor2Called) {
          fillStyle.push({ color: "#DC6CDE", x: args[0], y: args[1], w: args[2], h: args[3] });
          fillStyleColor1Called = false;
          fillStyleColor2Called = false;
        }
      },
    });

    model.drawGrid(ctx);
    expect(fillStyle).toEqual([{ color: "#DC6CDF", h: 3 * 23, w: 96, x: 0, y: 0 }]);

    fillStyle = [];
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: [toZone("A1")],
      style: { fillColor: "#DC6CDE" },
    });
    model.drawGrid(ctx);
    expect(fillStyle).toEqual([{ color: "#DC6CDE", h: 3 * 23, w: 96, x: 0, y: 0 }]);
  });

  test("fillstyle of cell works with CF", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 1,
          rowNumber: 3,
        },
      ],
    });
    const sheetId = model.getters.getActiveSheetId();
    model.dispatch("ADD_CONDITIONAL_FORMAT", {
      cf: createEqualCF("1", { fillColor: "#DC6CDF" }, "1"),
      sheetId,
      ranges: toRangesData(sheetId, "A1"),
    });

    let fillStyle: any[] = [];
    let fillStyleColor1Called = false;
    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "fillStyle" && value === "#DC6CDF") {
          fillStyleColor1Called = true;
        }
      },
      onFunctionCall: (val, args) => {
        if (val === "fillRect" && fillStyleColor1Called) {
          fillStyle.push({ color: "#DC6CDF", x: args[0], y: args[1], w: args[2], h: args[3] });
          fillStyleColor1Called = false;
        }
      },
    });

    model.drawGrid(ctx);
    expect(fillStyle).toEqual([]);

    fillStyle = [];
    setCellContent(model, "A1", "1");
    model.drawGrid(ctx);
    expect(fillStyle).toEqual([{ color: "#DC6CDF", h: 23, w: 96, x: 0, y: 0 }]);
  });

  test("fillstyle of merge works with CF", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 1,
          rowNumber: 3,
        },
      ],
    });
    const sheetId = model.getters.getActiveSheetId();
    model.dispatch("ADD_CONDITIONAL_FORMAT", {
      cf: createEqualCF("1", { fillColor: "#DC6CDF" }, "1"),
      ranges: toRangesData(sheetId, "A1"),
      sheetId,
    });
    merge(model, "A1:A3");
    let fillStyle: any[] = [];
    let fillStyleColor1Called = false;
    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "fillStyle" && value === "#DC6CDF") {
          fillStyleColor1Called = true;
        }
      },
      onFunctionCall: (val, args) => {
        if (val === "fillRect" && fillStyleColor1Called) {
          fillStyle.push({ color: "#DC6CDF", x: args[0], y: args[1], w: args[2], h: args[3] });
          fillStyleColor1Called = false;
        }
      },
    });

    model.drawGrid(ctx);
    expect(fillStyle).toEqual([]);

    fillStyle = [];
    setCellContent(model, "A1", "1");
    model.drawGrid(ctx);
    expect(fillStyle).toEqual([{ color: "#DC6CDF", h: 23 * 3, w: 96, x: 0, y: 0 }]);
  });

  test("formulas in a merge, evaluating to a string are properly aligned", () => {
    const model = new Model();
    merge(model, "A2:B2");
    setCellContent(model, "A1", "1");
    setCellContent(model, "A2", "=A1");

    let textAligns: string[] = [];

    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "textAlign") {
          textAligns.push(value);
        }
      },
    });
    model.drawGrid(ctx);

    expect(textAligns).toEqual(["right", "right", "center"]); // center for headers

    setCellContent(model, "A1", "asdf");

    textAligns = [];
    model.drawGrid(ctx);
    expect(textAligns).toEqual(["left", "left", "center"]); // center for headers
  });

  test("formulas evaluating to a boolean are properly aligned", () => {
    const model = new Model();

    setCellContent(model, "A1", "1");
    setCellContent(model, "A2", "=A1");

    let textAligns: string[] = [];
    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "textAlign") {
          textAligns.push(value);
        }
      },
    });
    model.drawGrid(ctx);
    expect(textAligns).toEqual(["right", "right", "center"]); // center for headers

    textAligns = [];
    setCellContent(model, "A1", "true");
    model.drawGrid(ctx);
    expect(textAligns).toEqual(["center", "center", "center"]); // center for headers
  });

  test("Cells in a merge evaluating to a number are properly aligned on overflow", () => {
    const model = new Model({
      sheets: [
        {
          id: 1,
          colNumber: 4,
          cols: { 0: { size: 2 }, 1: { size: 2 }, 2: { size: 12 }, 3: { size: 12 } },
          merges: ["A2:B2", "C2:D2"],
          cells: {
            A1: { content: "123456" },
            A2: { content: "=A1" },
            C1: { content: "123456891" },
            C2: { content: "=C1" },
          },
          conditionalFormats: [
            {
              id: "1",
              ranges: ["C1:D2"],
              rule: {
                type: "IconSetRule",
                upperInflectionPoint: { type: "number", value: "1000", operator: "gt" },
                lowerInflectionPoint: { type: "number", value: "0", operator: "gt" },
                icons: {
                  upper: "arrowGood",
                  middle: "arrowNeutral",
                  lower: "arrowBad",
                },
              },
            },
          ],
        },
      ],
    });

    let textAligns: string[] = [];
    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "textAlign") {
          textAligns.push(value);
        }
      },
    });

    model.drawGrid(ctx);
    expect(textAligns).toEqual(["left", "left", "left", "left", "center"]); // A1-C1-A2:B2-C2:D2 and center for headers

    textAligns = [];
    setCellContent(model, "A1", "1");
    setCellContent(model, "C1", "1");
    model.drawGrid(ctx);
    expect(textAligns).toEqual(["right", "left", "right", "right", "center"]); // A1-C1-A2:B2-C2:D2 and center for headers. C1 is stil lin overflow
  });

  test("formulas in a merge, evaluating to a boolean are properly aligned", () => {
    const model = new Model();
    merge(model, "A2:B2");
    setCellContent(model, "A1", "1");
    setCellContent(model, "A2", "=A1");

    let textAligns: string[] = [];

    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "textAlign") {
          textAligns.push(value);
        }
      },
    });
    model.drawGrid(ctx);

    expect(textAligns).toEqual(["right", "right", "center"]); // center for headers

    setCellContent(model, "A1", "false");

    textAligns = [];
    model.drawGrid(ctx);
    expect(textAligns).toEqual(["center", "center", "center"]); // center for headers
  });

  test("errors are aligned to the center", () => {
    const model = new Model();

    setCellContent(model, "A1", "=A1");

    let textAligns: string[] = [];

    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "textAlign") {
          textAligns.push(value);
        }
      },
    });
    model.drawGrid(ctx);

    // 1 center for headers, 1 for cell content
    expect(textAligns).toEqual(["center", "center"]);
  });

  test("dates are aligned to the right", () => {
    const model = new Model();

    setCellContent(model, "A1", "03/23/2010");

    let textAligns: string[] = [];

    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "textAlign") {
          textAligns.push(value);
        }
      },
    });
    model.drawGrid(ctx);

    // 1 center for headers, 1 for cell content
    expect(textAligns).toEqual(["right", "center"]);
  });

  test("functions are aligned to the left", () => {
    const model = new Model();

    setCellContent(model, "A1", "=SUM(1,2)");
    model.dispatch("SET_FORMULA_VISIBILITY", { show: true });
    let textAligns: string[] = [];

    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "textAlign") {
          textAligns.push(value);
        }
      },
    });

    const getCellTextMock = jest.fn(() => "=SUM(1,2)");
    model.getters.getCellText = getCellTextMock;

    model.drawGrid(ctx);

    // 1 center for headers, 1 for cell content
    expect(textAligns).toEqual(["left", "center"]);
    expect(getCellTextMock).toHaveBeenLastCalledWith(
      { sheetId: expect.any(String), col: 0, row: 0 },
      true
    );
  });

  test("functions with centered content are aligned to the left", () => {
    const model = new Model();
    model.dispatch("SET_FORMATTING", {
      sheetId: model.getters.getActiveSheetId(),
      target: target("A1"),
      style: { align: "center" },
    });
    setCellContent(model, "A1", "=SUM(1,2)");
    model.dispatch("SET_FORMULA_VISIBILITY", { show: true });
    let textAligns: string[] = [];

    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "textAlign") {
          textAligns.push(value);
        }
      },
    });

    const getCellTextMock = jest.fn(() => "=SUM(1,2)");
    model.getters.getCellText = getCellTextMock;

    model.drawGrid(ctx);

    // 1 center for headers, 1 for cell content
    expect(textAligns).toEqual(["left", "center"]);
    expect(getCellTextMock).toHaveBeenLastCalledWith(
      { sheetId: expect.any(String), col: 0, row: 0 },
      true
    );
  });
  test("CF on empty cell", () => {
    const model = new Model({
      sheets: [
        {
          colNumber: 1,
          rowNumber: 1,
        },
      ],
    });
    let fillStyle: any[] = [];
    let fillStyleColor1Called = false;
    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onSet: (key, value) => {
        if (key === "fillStyle" && value === "#DC6CDF") {
          fillStyleColor1Called = true;
        }
      },
      onFunctionCall: (val, args) => {
        if (val === "fillRect" && fillStyleColor1Called) {
          fillStyle.push({ color: "#DC6CDF", x: args[0], y: args[1], w: args[2], h: args[3] });
          fillStyleColor1Called = false;
        }
      },
    });

    model.drawGrid(ctx);
    expect(fillStyle).toEqual([]);
    fillStyle = [];
    const sheetId = model.getters.getActiveSheetId();
    let result = model.dispatch("ADD_CONDITIONAL_FORMAT", {
      cf: createEqualCF("", { fillColor: "#DC6CDF" }, "1"),
      ranges: toRangesData(sheetId, "A1"),
      sheetId,
    });
    expect(result).toBeSuccessfullyDispatched();
    model.drawGrid(ctx);
    expect(fillStyle).toEqual([{ color: "#DC6CDF", h: 23, w: 96, x: 0, y: 0 }]);
  });

  test.each(["I am a very long text", "100000000000000"])(
    "Overflowing left-aligned content is correctly clipped",
    (overflowingContent) => {
      let box: Box;
      const model = new Model({
        sheets: [
          {
            id: "sheet1",
            colNumber: 3,
            rowNumber: 1,
            cols: { 1: { size: 5 } },
            cells: { B1: { content: overflowingContent, style: 1 } },
          },
        ],
        styles: { 1: { align: "left" } },
      });

      let ctx = new MockGridRenderingContext(model, 1000, 1000, {});
      model.drawGrid(ctx);

      box = getBoxFromText(model, overflowingContent);
      // no clip
      expect(box.clipRect).toBeUndefined();

      // no clipping at the left
      setCellContent(model, "A1", "Content at the left");
      model.drawGrid(ctx);
      box = getBoxFromText(model, overflowingContent);
      expect(box.clipRect).toBeUndefined();

      // clipping at the right
      setCellContent(model, "C1", "Content at the right");
      model.drawGrid(ctx);
      box = getBoxFromText(model, overflowingContent);
      expect(box.clipRect).toEqual({
        x: DEFAULT_CELL_WIDTH,
        y: 0,
        width: 5,
        height: DEFAULT_CELL_HEIGHT,
      });
    }
  );

  test.each([{ align: "left" }, { align: undefined }])(
    "Overflowing number with % align is correctly clipped",
    (style) => {
      const overflowingNumber = "100000000000000";
      let box: Box;
      const model = new Model({
        sheets: [
          {
            id: "sheet1",
            colNumber: 3,
            rowNumber: 1,
            cols: { 1: { size: 5 } },
            cells: { B1: { content: overflowingNumber, style: 1 } },
          },
        ],
        styles: { 1: style },
      });

      let ctx = new MockGridRenderingContext(model, 1000, 1000, {});
      model.drawGrid(ctx);

      box = getBoxFromText(model, overflowingNumber);
      // no clip
      expect(box.clipRect).toBeUndefined();

      // no clipping at the left
      setCellContent(model, "A1", "Content at the left");
      model.drawGrid(ctx);
      box = getBoxFromText(model, overflowingNumber);
      expect(box.clipRect).toBeUndefined();

      // clipping at the right
      setCellContent(model, "C1", "Content at the right");
      model.drawGrid(ctx);
      box = getBoxFromText(model, overflowingNumber);
      expect(box.clipRect).toEqual({
        x: DEFAULT_CELL_WIDTH,
        y: 0,
        width: 5,
        height: DEFAULT_CELL_HEIGHT,
      });
    }
  );

  test("Overflowing right-aligned text is correctly clipped", () => {
    const overflowingText = "I am a very long text";
    let box: Box;
    const model = new Model({
      sheets: [
        {
          id: "sheet1",
          colNumber: 3,
          rowNumber: 1,
          cols: { 1: { size: 5 } },
          cells: { B1: { content: overflowingText, style: 1 } },
        },
      ],
      styles: { 1: { align: "right" } },
    });

    let ctx = new MockGridRenderingContext(model, 1000, 1000, {});
    model.drawGrid(ctx);

    box = getBoxFromText(model, overflowingText);
    // no clip
    expect(box.clipRect).toBeUndefined();

    // no clipping at the right
    setCellContent(model, "C1", "Content at the left");
    model.drawGrid(ctx);
    box = getBoxFromText(model, overflowingText);
    expect(box.clipRect).toBeUndefined();

    // clipping at the left
    setCellContent(model, "A1", "Content at the right");
    model.drawGrid(ctx);
    box = getBoxFromText(model, overflowingText);
    expect(box.clipRect).toEqual({
      x: DEFAULT_CELL_WIDTH,
      y: 0,
      width: 5,
      height: DEFAULT_CELL_HEIGHT,
    });
  });

  test.each(["I am a very long text", "100000000000000"])(
    "Overflowing centered content is clipped on both sides",
    (overflowingContent) => {
      let centeredBox: Box;
      const model = new Model({
        sheets: [
          {
            id: "sheet1",
            colNumber: 3,
            rowNumber: 1,
            cols: { 1: { size: 5 } },
            cells: { B1: { content: overflowingContent, style: 1 } },
          },
        ],
        styles: { 1: { align: "center" } },
      });

      let ctx = new MockGridRenderingContext(model, 1000, 1000, {});
      model.drawGrid(ctx);

      centeredBox = getBoxFromText(model, overflowingContent);
      // // spans from A1 to C1 <-> no clip
      expect(centeredBox.clipRect).toBeUndefined();

      setCellContent(model, "A1", "left");
      model.drawGrid(ctx);

      centeredBox = getBoxFromText(model, overflowingContent);
      expect(centeredBox.clipRect).toEqual({
        x: DEFAULT_CELL_WIDTH, // clipped to the left
        y: 0,
        width: 5 + DEFAULT_CELL_WIDTH,
        height: DEFAULT_CELL_HEIGHT,
      });

      setCellContent(model, "C1", "right");
      model.drawGrid(ctx);

      centeredBox = getBoxFromText(model, overflowingContent);
      expect(centeredBox.clipRect).toEqual({
        x: DEFAULT_CELL_WIDTH, //clipped to the left
        y: 0,
        width: 5, // clipped to the right
        height: DEFAULT_CELL_HEIGHT,
      });
    }
  );

  test.each(["left", "right", "center"])(
    "Content in merge is clipped and cannot overflow",
    (align) => {
      const overflowingText = "I am a very long text";
      let box: Box;
      const model = new Model({
        sheets: [
          {
            id: "sheet1",
            colNumber: 5,
            rowNumber: 5,
            cols: { 1: { size: 5 }, 2: { size: 5 } },
            cells: { B1: { content: overflowingText, style: 1 } },
            merges: ["B1:C2"],
          },
        ],
        styles: { 1: { align } },
      });

      let ctx = new MockGridRenderingContext(model, 1000, 1000, {});
      model.drawGrid(ctx);

      box = getBoxFromText(model, overflowingText);
      expect(box.clipRect).toEqual({
        x: DEFAULT_CELL_WIDTH,
        y: 0,
        width: 10,
        height: DEFAULT_CELL_HEIGHT * 2,
      });
    }
  );

  test.each(["left", "right", "center"])(
    'Cells with the wrapping style "wrap" cannot overflow long text content',
    (align) => {
      const overflowingText = "I am a very very very long text";
      let box: Box;
      const model = new Model({
        sheets: [
          {
            id: "sheet1",
            colNumber: 3,
            rowNumber: 1,
            cols: { 1: { size: 20 } },
            cells: { B1: { content: overflowingText, style: 1 } },
          },
        ],
        styles: { 1: { align, wrapping: "wrap" } },
      });

      let ctx = new MockGridRenderingContext(model, 1000, 1000, {});
      model.drawGrid(ctx);

      box = getBoxFromText(model, overflowingText);
      expect(box.clipRect).toEqual({
        x: DEFAULT_CELL_WIDTH, // clipped to the left
        y: 0,
        width: 20, // clipped to the right
        height: DEFAULT_CELL_HEIGHT,
      });
    }
  );

  test.each(["left", "right", "center"])(
    'Cells with the wrapping style "crop" cannot overflow long text content',
    (align) => {
      const overflowingText = "I am a very very very long text";
      let box: Box;
      const model = new Model({
        sheets: [
          {
            id: "sheet1",
            colNumber: 3,
            rowNumber: 1,
            cols: { 1: { size: 20 } },
            cells: { B1: { content: overflowingText, style: 1 } },
          },
        ],
        styles: { 1: { align, wrapping: "clip" } },
      });

      let ctx = new MockGridRenderingContext(model, 1000, 1000, {});
      model.drawGrid(ctx);

      box = getBoxFromText(model, overflowingText);
      expect(box.clipRect).toEqual({
        x: DEFAULT_CELL_WIDTH, // clipped to the left
        y: 0,
        width: 20, // clipped to the right
        height: DEFAULT_CELL_HEIGHT,
      });
    }
  );

  test("cells with a fontsize too big for the row height are clipped", () => {
    const overflowingText = "TOO HIGH";
    const fontSize = 26;
    let box: Box;
    const model = new Model({
      sheets: [
        {
          id: "sheet1",
          colNumber: 1,
          rowNumber: 1,
          rows: { 0: { size: Math.floor(fontSizeMap[fontSize] + 5) } },
          cells: { A1: { content: overflowingText, style: 1 } },
        },
      ],
      styles: { 1: { fontSize } },
    });

    let ctx = new MockGridRenderingContext(model, 1000, 1000, {});
    model.drawGrid(ctx);

    box = getBoxFromText(model, overflowingText);
    expect(box.clipRect).toBeUndefined();

    resizeRows(model, [0], Math.floor(fontSizeMap[fontSize] / 2));
    model.drawGrid(ctx);
    box = getBoxFromText(model, overflowingText);
    expect(box.clipRect).toEqual({
      x: 0,
      y: 0,
      width: DEFAULT_CELL_WIDTH,
      height: Math.floor(fontSizeMap[fontSize] / 2),
    });
  });

  test("cells with icon CF are correctly clipped", () => {
    let box: Box;
    const cellContent = "10000";
    const model = new Model({
      sheets: [
        {
          id: "sheet1",
          colNumber: 1,
          rowNumber: 1,
          cells: { A1: { content: "10000" } },
          conditionalFormats: [
            {
              id: "1",
              ranges: ["A1"],
              rule: {
                type: "IconSetRule",
                upperInflectionPoint: { type: "number", value: "1000", operator: "gt" },
                lowerInflectionPoint: { type: "number", value: "0", operator: "gt" },
                icons: {
                  upper: "arrowGood",
                  middle: "arrowNeutral",
                  lower: "arrowBad",
                },
              },
            },
          ],
        },
      ],
    });

    let ctx = new MockGridRenderingContext(model, 1000, 1000, {});
    model.drawGrid(ctx);
    box = getBoxFromText(model, cellContent);
    const maxIconBoxWidth = box.image!.size + 2 * MIN_CF_ICON_MARGIN;
    expect(box.image!.clipIcon).toEqual({
      x: 0,
      y: 0,
      width: maxIconBoxWidth,
      height: DEFAULT_CELL_HEIGHT,
    });
    expect(box.clipRect).toEqual({
      x: maxIconBoxWidth,
      y: 0,
      width: DEFAULT_CELL_WIDTH - maxIconBoxWidth,
      height: DEFAULT_CELL_HEIGHT,
    });

    resizeColumns(model, ["A"], maxIconBoxWidth - 3);
    model.drawGrid(ctx);
    box = getBoxFromText(model, cellContent);
    expect(box.image!.clipIcon).toEqual({
      x: 0,
      y: 0,
      width: maxIconBoxWidth - 3,
      height: DEFAULT_CELL_HEIGHT,
    });
    expect(box.clipRect).toEqual({
      x: maxIconBoxWidth,
      y: 0,
      width: 0,
      height: DEFAULT_CELL_HEIGHT,
    });
  });

  test.each([
    ["right", ["left"], { left: 1, right: 1, top: 1, bottom: 1 }], // align right, left border => clipped on cell zone
    ["right", ["left", "right"], { left: 1, right: 1, top: 1, bottom: 1 }], // align right, left + right border => clipped on cell zone
    ["right", ["right"], undefined], // align right, right border => no clip

    ["left", ["right"], { left: 1, right: 1, top: 1, bottom: 1 }], // align left, right border => clipped on cell zone
    ["left", ["left", "right"], { left: 1, right: 1, top: 1, bottom: 1 }], // align left, left + right border => clipped on cell zone
    ["left", ["left"], undefined], // align left, left border => no clip

    ["center", ["right"], { left: 0, right: 1, top: 1, bottom: 1 }], // align center, right border => clipped right
    ["center", ["left", "right"], { left: 1, right: 1, top: 1, bottom: 1 }], // align center, left + right border => clipped on cell zone
    ["center", ["left"], { left: 1, right: 2, top: 1, bottom: 1 }], // align center, right border => clipped left
  ])(
    "cells with borders are correctly clipped",
    (align: string, borders: string[], expectedClipRectZone: Zone | undefined) => {
      const cellContent = "This is a long text larger than a cell";
      const model = new Model({
        sheets: [
          {
            id: "sheet1",
            colNumber: 3,
            rowNumber: 3,
            cells: { B2: { content: cellContent } },
            cols: { 1: { size: 10 } },
          },
        ],
      });

      setStyle(model, "B2", { align: align as Align });

      for (const border of borders) {
        setBorder(model, border as BorderCommand, "B2");
      }

      let ctx = new MockGridRenderingContext(model, 1000, 1000, {});
      model.drawGrid(ctx);
      const box = getBoxFromText(model, cellContent);
      expect(box.clipRect).toEqual(
        expectedClipRectZone ? model.getters.getVisibleRect(expectedClipRectZone) : undefined
      );
    }
  );

  test.each([
    ["right", { left: 1, right: 2, top: 0, bottom: 0 }], // align right, left border => clipped on cell zone
    ["left", { left: 2, right: 3, top: 0, bottom: 0 }], // align left, left + right border => clipped on cell zone
    ["center", { left: 1, right: 3, top: 0, bottom: 0 }], // align center, right border => clipped left
  ])(
    "Cell text overflowing on multiple cells is cut as soon as it encounter a border with align %s",
    (align: string, expectedClipRectZone: Zone | undefined) => {
      const cellContent = "This is a very vey very very very very long text larger than a cell";
      const model = new Model({
        sheets: [
          {
            id: "sheet1",
            colNumber: 6,
            rowNumber: 6,
            cells: { C1: { content: cellContent } },
            cols: { 1: { size: 10 }, 2: { size: 10 }, 3: { size: 10 } },
          },
        ],
      });

      setBorder(model, "right", "A1");
      setStyle(model, "C1", { align: align as Align });
      setBorder(model, "left", "E1");

      let ctx = new MockGridRenderingContext(model, 1000, 1000, {});
      model.drawGrid(ctx);
      const box = getBoxFromText(model, cellContent);
      expect(box.clipRect).toEqual(
        expectedClipRectZone ? model.getters.getVisibleRect(expectedClipRectZone) : undefined
      );
    }
  );

  test.each(["A1", "A1:A2", "A1:A2,B1:B2", "A1,C1"])(
    "compatible copied zones %s are all outlined with dots",
    (targetXc) => {
      const model = new Model();
      copy(model, ...targetXc.split(","));
      const { ctx, isDotOutlined, reset } = watchClipboardOutline(model);
      model.drawGrid(ctx);
      const copiedTarget = target(targetXc);
      expect(isDotOutlined(copiedTarget)).toBeTruthy();
      paste(model, "A10");
      reset();
      model.drawGrid(ctx);
      expect(isDotOutlined(copiedTarget)).toBeFalsy();
    }
  );

  test.each(["A1,A2", "A1:A2,A4:A5"])(
    "only last copied non-compatible zones %s is outlined with dots",
    (targetXc) => {
      const model = new Model();
      copy(model, ...targetXc.split(","));
      const { ctx, isDotOutlined, reset } = watchClipboardOutline(model);
      model.drawGrid(ctx);
      const copiedTarget = target(targetXc);
      const expectedOutlinedZone = copiedTarget.slice(-1);
      expect(isDotOutlined(expectedOutlinedZone)).toBeTruthy();
      paste(model, "A10");
      reset();
      model.drawGrid(ctx);
      expect(isDotOutlined(expectedOutlinedZone)).toBeFalsy();
    }
  );

  test.each([
    (model) => setCellContent(model, "B15", "hello"),
    (model) => addColumns(model, "after", "B", 1),
    (model) => deleteColumns(model, ["K"]),
  ])("copied zone outline is removed at first change to the grid", (coreOperation) => {
    const model = new Model();
    copy(model, "A1:A2");
    const { ctx, isDotOutlined, reset } = watchClipboardOutline(model);
    model.drawGrid(ctx);
    const copiedTarget = target("A1:A2");
    expect(isDotOutlined(copiedTarget)).toBeTruthy();
    coreOperation(model);
    reset();
    model.drawGrid(ctx);
    expect(isDotOutlined(copiedTarget)).toBeFalsy();
  });

  test.each([
    ["dashboard" as Mode, { x: 0, y: 0, width: DEFAULT_CELL_WIDTH, height: DEFAULT_CELL_HEIGHT }],
    ["normal" as Mode, { x: 0, y: 0, width: DEFAULT_CELL_WIDTH, height: DEFAULT_CELL_HEIGHT }],
  ])("A1 starts at the upper left corner with mode %s", (mode, expectedRect) => {
    const model = new Model({}, { mode });
    const rect = model.getters.getVisibleRect(toZone("A1"));
    expect(rect).toEqual(expectedRect);
  });

  test("Error red triangle is correctly displayed/hidden", () => {
    /* Test if the error upper-right red triangle is correctly displayed
     * according to the kind of error
     */
    const model = new Model({
      sheets: [
        {
          id: "sheet1",
          colNumber: 10,
          rowNumber: 1,
          cells: {
            A1: { content: "=NA()" },
            B1: { content: "=B1" },
            C1: { content: "=A0" },
            D1: { content: "=(+" },
            E1: { content: "=5/0" },
          },
          conditionalFormats: [],
        },
      ],
    });

    let filled: number[][] = [];
    let current: number[] = [0, 0];

    let ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onFunctionCall: (val, args) => {
        if (val == "moveTo") {
          current = [args[0], args[1]];
        } else if (val == "fill") {
          filled.push([current[0], current[1]]);
        }
      },
    });
    model.drawGrid(ctx);
    const boxA1 = getBoxFromText(model, "#N/A"); //NotAvailableError => Shouldn't display
    expect(boxA1.error).toBeUndefined();
    const boxB1 = getBoxFromText(model, "#CYCLE"); //CycleError => Should display
    expect(boxB1.error).toBe("Circular reference");
    expect(filled[0][0]).toBe(boxB1.x + boxB1.width - 5);
    expect(filled[0][1]).toBe(boxB1.y);
    const boxC1 = getBoxFromText(model, "#REF"); //BadReferenceError => Should display
    expect(boxC1.error).toBe("Invalid reference");
    expect(filled[1][0]).toBe(boxC1.x + boxC1.width - 5);
    expect(filled[1][1]).toBe(boxC1.y);
    const boxD1 = getBoxFromText(model, "#BAD_EXPR"); //BadExpressionError => Should display
    expect(boxD1.error).toBeTruthy();
    expect(filled[2][0]).toBe(boxD1.x + boxD1.width - 5);
    expect(filled[2][1]).toBe(boxD1.y);
    const boxE1 = getBoxFromText(model, "#ERROR"); // GeneralError => Should display
    expect(boxE1.error).toBeTruthy();
    expect(filled[3][0]).toBe(boxE1.x + boxE1.width - 5);
    expect(filled[3][1]).toBe(boxE1.y);
  });

  test("Do not draw gridLines over colored cells in dashboard mode", () => {
    const CellFillColor = "#fe0000";
    const model = new Model({
      sheets: [
        {
          id: "Sheet1",
          name: "Sheet1",
          cells: { A1: { style: 1 }, A2: { style: 1 } },
        },
      ],
      styles: { 1: { fillColor: CellFillColor } },
    });

    let strokeColors: string[];
    const ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onFunctionCall: (val, _, renderingContext) => {
        if (val === "strokeRect") {
          strokeColors.push(renderingContext.ctx.strokeStyle as string);
        }
      },
    });

    // Default Model displaying grid lines
    strokeColors = [];
    model.drawGrid(ctx);
    expect(strokeColors).toEqual([
      CELL_BACKGROUND_GRIDLINE_STROKE_STYLE,
      CELL_BACKGROUND_GRIDLINE_STROKE_STYLE,
      SELECTION_BORDER_COLOR, // selection drawGrid
      SELECTION_BORDER_COLOR, // selection drawGrid
    ]);

    // dashboard mode
    model.updateMode("dashboard");
    strokeColors = [];
    model.drawGrid(ctx);
    expect(strokeColors).toEqual([]);
  });

  test("Do not draw gridLines over colored cells while hiding grid lines", () => {
    const CellFillColor = "#fe0000";
    const model = new Model({
      sheets: [
        {
          id: "Sheet1",
          name: "Sheet1",
          cells: { A1: { style: 1 }, A2: { style: 1 } },
        },
      ],
      styles: { 1: { fillColor: CellFillColor } },
    });

    let strokeColors: string[];
    const ctx = new MockGridRenderingContext(model, 1000, 1000, {
      onFunctionCall: (val, _, renderingContext) => {
        if (val === "strokeRect") {
          strokeColors.push(renderingContext.ctx.strokeStyle as string);
        }
      },
    });

    // Default Model displaying grid lines
    strokeColors = [];
    model.drawGrid(ctx);
    expect(strokeColors).toEqual([
      CELL_BACKGROUND_GRIDLINE_STROKE_STYLE,
      CELL_BACKGROUND_GRIDLINE_STROKE_STYLE,
      SELECTION_BORDER_COLOR, // selection drawGrid
      SELECTION_BORDER_COLOR, // selection drawGrid
    ]);

    // model without grid lines
    model.dispatch("SET_GRID_LINES_VISIBILITY", { sheetId: "Sheet1", areGridLinesVisible: false });
    strokeColors = [];
    model.drawGrid(ctx);
    expect(strokeColors).toEqual([
      SELECTION_BORDER_COLOR, // selection drawGrid
      SELECTION_BORDER_COLOR, // selection drawGrid
    ]);
  });
});
