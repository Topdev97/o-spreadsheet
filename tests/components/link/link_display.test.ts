import { Model } from "../../../src";
import { buildSheetLink } from "../../../src/helpers";
import { isLink } from "../../../src/helpers/cells/index";
import { clearCell, createSheet, setCellContent } from "../../test_helpers/commands_helpers";
import { clickCell, rightClickCell, simulateClick } from "../../test_helpers/dom_helper";
import { getCell } from "../../test_helpers/getters_helpers";
import { GridParent, makeTestFixture, nextTick } from "../../test_helpers/helpers";

describe("link display component", () => {
  let fixture: HTMLElement;
  let model: Model;
  let grid: GridParent;

  beforeEach(async () => {
    fixture = makeTestFixture();
    model = new Model();
    grid = new GridParent(model);
    await grid.mount(fixture);
  });

  afterEach(() => {
    grid.destroy();
    fixture.remove();
  });

  test("link shows the url", async () => {
    setCellContent(model, "A1", "[label](url.com)");
    await clickCell(model, "A1");
    expect(fixture.querySelector("a")?.getAttribute("href")).toBe("https://url.com");
    expect(fixture.querySelector("a")?.getAttribute("target")).toBe("_blank");
  });

  test("link is displayed and closed when cell is clicked", async () => {
    setCellContent(model, "A1", "[label](url.com)");
    await clickCell(model, "A1");
    expect(fixture.querySelector(".o-link-tool")).toBeTruthy();
    await clickCell(model, "A2");
    expect(fixture.querySelector(".o-link-tool")).toBeFalsy();
  });

  test("link is displayed and closed when the cell is right-clicked", async () => {
    setCellContent(model, "A1", "[label](url.com)");
    await clickCell(model, "A1");
    expect(fixture.querySelector(".o-link-tool")).toBeTruthy();
    await rightClickCell(model, "A1");
    expect(fixture.querySelector(".o-link-tool")).toBeFalsy();
  });

  test("link is displayed and closed when other cell is right-clicked", async () => {
    setCellContent(model, "A1", "[label](url.com)");
    await clickCell(model, "A1");
    expect(fixture.querySelector(".o-link-tool")).toBeTruthy();
    await rightClickCell(model, "A2");
    expect(fixture.querySelector(".o-link-tool")).toBeFalsy();
  });

  test("link is closed when other cell is selected with arrows", async () => {
    setCellContent(model, "A1", "[label](url.com)");
    await clickCell(model, "A1");
    expect(fixture.querySelector(".o-link-tool")).toBeTruthy();
    fixture
      .querySelector("canvas")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await nextTick();
    expect(fixture.querySelector(".o-link-tool")).toBeFalsy();
  });

  test("component is closed when cell is deleted", async () => {
    setCellContent(model, "A1", "[label](url.com)");
    await clickCell(model, "A1");
    expect(fixture.querySelector(".o-link-tool")).toBeTruthy();
    clearCell(model, "A1");
    await nextTick();
    expect(fixture.querySelector(".o-link-tool")).toBeFalsy();
  });

  test("component is closed when side panel is opened", async () => {
    setCellContent(model, "A1", "[label](url.com)");
    await clickCell(model, "A1");
    expect(fixture.querySelector(".o-link-tool")).toBeTruthy();
    grid.env.openSidePanel("FindAndReplace");
    await nextTick();
    expect(fixture.querySelector(".o-link-tool")).toBeFalsy();
  });

  test("remove link by clicking the unlink icon", async () => {
    setCellContent(model, "A1", "[label](url.com)");
    await clickCell(model, "A1");
    await simulateClick(".o-unlink");
    expect(fixture.querySelector(".o-link-tool")).toBeFalsy();
    const cell = getCell(model, "A1");
    expect(isLink(cell)).toBeFalsy();
    expect(cell?.content).toBe("label");
  });

  test("link text color is removed when the cell is unlinked", async () => {
    setCellContent(model, "A1", "[label](url.com)");
    await clickCell(model, "A1");
    model.dispatch("UPDATE_CELL", {
      col: 0,
      row: 0,
      sheetId: model.getters.getActiveSheetId(),
      content: "[label](url.com)",
      style: { bold: true },
    });
    await simulateClick(".o-unlink");
    expect(getCell(model, "A1")?.style).toEqual({
      bold: true,
      textColor: undefined,
      underline: undefined,
    });
  });

  test("link text color is not removed when the cell is unlinked if it is custom", async () => {
    setCellContent(model, "A1", "[label](url.com)");
    model.dispatch("UPDATE_CELL", {
      col: 0,
      row: 0,
      sheetId: model.getters.getActiveSheetId(),
      style: { bold: true, textColor: "#555" },
    });
    await clickCell(model, "A1");
    await simulateClick(".o-unlink");
    expect(getCell(model, "A1")?.style).toEqual({
      bold: true,
      textColor: "#555",
      underline: undefined,
    });
  });

  test("open link editor", async () => {
    setCellContent(model, "A1", "[label](url.com)");
    await clickCell(model, "A1");
    await simulateClick(".o-edit-link");
    expect(fixture.querySelector(".o-link-tool")).toBeFalsy();
    const editor = fixture.querySelector(".o-link-editor");
    expect(editor).toBeTruthy();
    const inputs = editor?.querySelectorAll("input")!;
    expect(inputs[0].value).toBe("label");
    expect(inputs[1].value).toBe("https://url.com");
  });

  test("click on a web link opens the page", async () => {
    const spy = jest.spyOn(window, "open").mockImplementation();
    setCellContent(model, "A1", "[label](url.com)");
    await clickCell(model, "A1");
    await simulateClick("a");
    expect(spy).toHaveBeenCalledWith("https://url.com", "_blank");
    expect(fixture.querySelector(".o-link-tool")).toBeTruthy();
  });

  test("click on a sheet link activates the sheet", async () => {
    const sheetId = "42";
    createSheet(model, { sheetId });
    setCellContent(model, "A1", `[label](${buildSheetLink(sheetId)})`);
    await clickCell(model, "A1");
    expect(model.getters.getActiveSheetId()).not.toBe(sheetId);
    await simulateClick("a");
    expect(model.getters.getActiveSheetId()).toBe(sheetId);
    expect(fixture.querySelector(".o-link-tool")).toBeFalsy();
  });
});
