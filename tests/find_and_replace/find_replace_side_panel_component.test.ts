import { Model, Spreadsheet } from "../../src";
import { toZone } from "../../src/helpers";
import { SearchOptions } from "../../src/types/find_and_replace";
import { activateSheet, createSheet, setCellContent } from "../test_helpers/commands_helpers";
import {
  click,
  focusAndKeyDown,
  setInputValueAndTrigger,
  simulateClick,
} from "../test_helpers/dom_helper";
import { mountSpreadsheet, nextTick, spyDispatch } from "../test_helpers/helpers";
jest.mock("../../src/helpers/uuid", () => require("../__mocks__/uuid"));

let model: Model;

const selectors = {
  closeSidepanel: ".o-sidePanel .o-sidePanelClose",
  inputSearch:
    ".o-sidePanel .o-find-and-replace .o-section:nth-child(1) .o-input-search-container input.o-input-with-count",
  inputReplace: ".o-sidePanel .o-find-and-replace .o-section:nth-child(3) input",
  previousButton:
    ".o-sidePanel .o-find-and-replace .o-sidePanelButtons:nth-of-type(2) .o-button:nth-child(1)",
  nextButton:
    ".o-sidePanel .o-find-and-replace .o-sidePanelButtons:nth-of-type(2) .o-button:nth-child(2)",
  replaceButton:
    ".o-sidePanel .o-find-and-replace .o-sidePanelButtons:nth-of-type(4) .o-button:nth-child(1)",
  replaceAllButton:
    ".o-sidePanel .o-find-and-replace .o-sidePanelButtons:nth-of-type(4) .o-button:nth-child(2)",
  checkBoxMatchingCase:
    ".o-sidePanel .o-find-and-replace .o-section:nth-child(1) .o-checkbox:nth-child(1) input",
  checkBoxExactMatch:
    ".o-sidePanel .o-find-and-replace .o-section:nth-child(1) .o-checkbox:nth-child(2) input",
  checkBoxSearchFormulas:
    ".o-sidePanel .o-find-and-replace .o-section:nth-child(1) .o-checkbox:nth-child(3) input",
  checkBoxReplaceFormulas:
    ".o-sidePanel .o-find-and-replace .o-section:nth-child(3) .o-far-item:nth-child(3) input",
  searchRangeSelection: ".o-sidePanel .o-find-and-replace .o-section:nth-child(1) .o-type-selector",
  searchRange: ".o-sidePanel .o-find-and-replace .o-section:nth-child(1) .o-selection-input input",
  resetSearchRange: ".o-sidePanel .o-find-and-replace .o-section:nth-child(1) .o-selection-ko",
  confirmSearchRange: ".o-sidePanel .o-find-and-replace .o-section:nth-child(1) .o-selection-ok",
  matchesCount: ".o-sidePanel .o-find-and-replace .o-matches-count",
};

function changeSearchScope(scope: SearchOptions["searchScope"]) {
  const selectRangeSelection = document.querySelector(
    selectors.searchRangeSelection
  ) as HTMLSelectElement;
  setInputValueAndTrigger(selectRangeSelection, scope);
}

function inputSearchValue(value: string) {
  setInputValueAndTrigger(selectors.inputSearch, value);
  jest.runOnlyPendingTimers();
}

function getMatchesCountContent() {
  const countDivs = document.querySelectorAll(selectors.matchesCount + " div");
  return [...countDivs].map((div) => div.textContent);
}

const DEFAULT_SEARCH_OPTS: SearchOptions = {
  matchCase: false,
  exactMatch: false,
  searchFormulas: false,
  searchScope: "allSheets",
  specificRange: undefined,
};

describe("find and replace sidePanel component", () => {
  let fixture: HTMLElement;
  let parent: Spreadsheet;

  describe("Sidepanel", () => {
    beforeEach(async () => {
      ({ parent, model, fixture } = await mountSpreadsheet());
      parent.env.openSidePanel("FindAndReplace");
      await nextTick();
    });

    test("Closing the side panel clears the search", async () => {
      const dispatch = spyDispatch(parent);
      expect(document.querySelectorAll(".o-sidePanel").length).toBe(1);
      await click(fixture, selectors.closeSidepanel);
      expect(dispatch).toHaveBeenCalledWith("CLEAR_SEARCH");
    });

    test("When opening sidepanel, focus will be on search input", async () => {
      expect(document.querySelectorAll(".o-sidePanel").length).toBe(1);
      await nextTick();
      expect(document.activeElement).toBe(document.querySelector(selectors.inputSearch));
    });

    test("disable next/previous/replace/replaceAll if searching on empty string", async () => {
      await setInputValueAndTrigger(selectors.inputSearch, "");
      expect((document.querySelector(selectors.previousButton) as HTMLButtonElement).disabled).toBe(
        true
      );
      expect((document.querySelector(selectors.nextButton) as HTMLButtonElement).disabled).toBe(
        true
      );
      expect((document.querySelector(selectors.replaceButton) as HTMLButtonElement).disabled).toBe(
        true
      );
      expect(
        (document.querySelector(selectors.replaceAllButton) as HTMLButtonElement).disabled
      ).toBe(true);
    });
  });
  describe("basic search", () => {
    let dispatch;

    beforeEach(async () => {
      jest.useFakeTimers();
      ({ parent, model, fixture } = await mountSpreadsheet());
      parent.env.openSidePanel("FindAndReplace");
      await nextTick();
      dispatch = spyDispatch(parent);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("simple search", async () => {
      /** Fake timers use to control debounceSearch in Find and Replace */
      setInputValueAndTrigger(selectors.inputSearch, "1");
      jest.runOnlyPendingTimers();
      await nextTick();
      expect(dispatch).toHaveBeenCalledWith("UPDATE_SEARCH", {
        searchOptions: DEFAULT_SEARCH_OPTS,
        toSearch: "1",
      });
    });

    test("clicking on next", async () => {
      setInputValueAndTrigger(selectors.inputSearch, "1");
      await click(fixture, selectors.nextButton);
      expect(dispatch).toHaveBeenCalledWith("SELECT_SEARCH_NEXT_MATCH");
    });

    test("Going to next with Enter key", async () => {
      setInputValueAndTrigger(selectors.inputSearch, "1");
      await focusAndKeyDown(selectors.inputSearch, { key: "Enter" });
      expect(dispatch).toHaveBeenCalledWith("SELECT_SEARCH_NEXT_MATCH");
    });

    test("clicking on previous", async () => {
      setInputValueAndTrigger(selectors.inputSearch, "1");
      await click(fixture, selectors.previousButton);
      expect(dispatch).toHaveBeenCalledWith("SELECT_SEARCH_PREVIOUS_MATCH");
    });

    test("search on empty string", async () => {
      setInputValueAndTrigger(selectors.inputSearch, "");
      jest.runOnlyPendingTimers();
      await nextTick();
      expect(dispatch).toHaveBeenCalledWith("UPDATE_SEARCH", {
        searchOptions: DEFAULT_SEARCH_OPTS,
        toSearch: "",
      });
    });

    test("Closing the sidepanel cancels the search", async () => {
      setInputValueAndTrigger(selectors.inputSearch, "g");
      await simulateClick(".o-sidePanelClose");
      jest.runOnlyPendingTimers();
      await nextTick();
      expect(dispatch).not.toHaveBeenCalledWith("UPDATE_SEARCH", expect.any(Object));
    });

    test("clicking on specific range and set range will update the range", async () => {
      expect(document.querySelector(selectors.searchRange)).toBeFalsy();
      changeSearchScope("specificRange");
      await nextTick();
      expect(document.querySelector(selectors.searchRange)).toBeTruthy();
      await setInputValueAndTrigger(selectors.searchRange, "A1:B2");
      expect(model.getters.getSearchOptions().specificRange).toBeUndefined();
      await click(fixture, selectors.confirmSearchRange);
      expect(model.getters.getSearchOptions().specificRange).toMatchObject({
        _sheetId: "Sheet1",
        _zone: toZone("A1:B2"),
      });
    });

    test("Specific range is following the active sheet", async () => {
      createSheet(model, { sheetId: "sh2", activate: true });
      changeSearchScope("specificRange");
      await nextTick();
      activateSheet(model, "Sheet1");
      await nextTick();
      await setInputValueAndTrigger(selectors.searchRange, "A1:B2");
      await click(fixture, selectors.confirmSearchRange);
      expect(model.getters.getSearchOptions().specificRange).toMatchObject({
        _sheetId: "sh2",
        _zone: toZone("A1:B2"),
      });
    });

    test.each(["allSheets", "activeSheet"] as const)(
      "Specific range is presistent when changing scopes",
      async (scope) => {
        changeSearchScope("specificRange");
        await nextTick();
        setInputValueAndTrigger(selectors.searchRange, "A1:B2");
        await nextTick();
        await click(fixture, selectors.confirmSearchRange);
        changeSearchScope(scope);
        await nextTick();
        expect(document.querySelector(selectors.searchRange)).toBeFalsy();
        changeSearchScope("specificRange");
        await nextTick();
        expect((document.querySelector(selectors.searchRange) as HTMLInputElement).value).toBe(
          "A1:B2"
        );
      }
    );

    test("Specific range is updated when reselecting the search input", async () => {
      changeSearchScope("specificRange");
      await nextTick();
      expect(fixture.querySelector(selectors.searchRange)).toBeTruthy();
      await simulateClick(selectors.searchRange);
      setInputValueAndTrigger(selectors.searchRange, "A1:B2");
      expect(model.getters.getSearchOptions().specificRange).toBeUndefined();
      await simulateClick(selectors.inputSearch);
      expect(model.getters.getSearchOptions().specificRange).toMatchObject({
        _sheetId: "Sheet1",
        _zone: toZone("A1:B2"),
      });
    });
  });

  describe("search count match", () => {
    beforeEach(async () => {
      jest.useFakeTimers();
      ({ parent, model, fixture } = await mountSpreadsheet());
      parent.env.openSidePanel("FindAndReplace");
      await nextTick();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("search match count is displayed", async () => {
      setCellContent(model, "A1", "Hello");
      expect(fixture.querySelector(".o-input-count")).toBeNull();
      inputSearchValue("Hel");
      await nextTick();
      expect(fixture.querySelector(".o-input-count")?.innerHTML).toBe("1 / 1");
    });

    test("search match count is removed when input is cleared", async () => {
      setCellContent(model, "A1", "Hello");
      await setInputValueAndTrigger(selectors.inputSearch, "Hel"); // wait the next render to check if the count is displayed
      expect(fixture.querySelector(".o-input-count")).toBeNull();
      jest.runOnlyPendingTimers();
      await nextTick();
      expect(fixture.querySelector(".o-input-count")?.innerHTML).toBe("1 / 1");
      inputSearchValue("");
      await nextTick();
      expect(fixture.querySelector(".o-input-count")).toBeNull();
    });

    test("search without match displays no match count", async () => {
      expect(fixture.querySelector(".o-input-count")).toBeNull();
      inputSearchValue("a search term");
      await nextTick();
      expect(fixture.querySelector(".o-input-count")?.innerHTML).toBe("0 / 0");
    });
  });

  describe("search options", () => {
    beforeEach(async () => {
      ({ parent, model, fixture } = await mountSpreadsheet());
      parent.env.openSidePanel("FindAndReplace");
      await nextTick();
    });
    test("Can search matching case", async () => {
      const dispatch = spyDispatch(parent);

      setInputValueAndTrigger(selectors.inputSearch, "Hell");
      await click(fixture, selectors.checkBoxMatchingCase);
      expect(dispatch).toHaveBeenCalledWith("UPDATE_SEARCH", {
        searchOptions: { ...DEFAULT_SEARCH_OPTS, matchCase: true },
        toSearch: "Hell",
      });
    });

    test("Can search matching entire cell", async () => {
      const dispatch = spyDispatch(parent);

      setInputValueAndTrigger(selectors.inputSearch, "Hell");
      await click(fixture, selectors.checkBoxExactMatch);
      expect(dispatch).toHaveBeenCalledWith("UPDATE_SEARCH", {
        searchOptions: { ...DEFAULT_SEARCH_OPTS, exactMatch: true },
        toSearch: "Hell",
      });
    });

    test("can search in formulas", async () => {
      const dispatch = spyDispatch(parent);

      setInputValueAndTrigger(selectors.inputSearch, "Hell");
      await click(fixture, selectors.checkBoxSearchFormulas);
      expect(dispatch).toHaveBeenCalledWith("UPDATE_SEARCH", {
        searchOptions: { ...DEFAULT_SEARCH_OPTS, searchFormulas: true },
        toSearch: "Hell",
      });
    });

    test("search in formulas shows formulas", async () => {
      await click(document.querySelector(selectors.checkBoxSearchFormulas)!);
      expect(model.getters.shouldShowFormulas()).toBe(true);
    });

    test("search in formulas should not show formula after closing the sidepanel", async () => {
      await click(fixture, selectors.checkBoxSearchFormulas);
      await click(fixture, selectors.closeSidepanel);
      expect(model.getters.shouldShowFormulas()).toBe(false);
    });

    test("Setting show formula from f&r should retain its state even it's changed via topbar", async () => {
      model.dispatch("SET_FORMULA_VISIBILITY", { show: true });
      await nextTick();
      expect(model.getters.shouldShowFormulas()).toBe(true);
      expect(
        (document.querySelector(selectors.checkBoxSearchFormulas) as HTMLInputElement).checked
      ).toBe(true);
      await click(fixture, selectors.checkBoxSearchFormulas);
      expect(model.getters.shouldShowFormulas()).toBe(false);
      expect(
        (document.querySelector(selectors.checkBoxSearchFormulas) as HTMLInputElement).checked
      ).toBe(false);
    });
  });
  describe("replace options", () => {
    beforeEach(async () => {
      ({ parent, model, fixture } = await mountSpreadsheet());
      parent.env.openSidePanel("FindAndReplace");
      await nextTick();
    });
    test("Can replace a simple text value", async () => {
      setInputValueAndTrigger(document.querySelector(selectors.inputSearch), "hello");
      setInputValueAndTrigger(document.querySelector(selectors.inputReplace), "kikou");
      const dispatch = spyDispatch(parent);
      await click(fixture, selectors.replaceButton);
      expect(dispatch).toHaveBeenCalledWith("REPLACE_SEARCH", { replaceWith: "kikou" });
    });

    test("Can replace a value in a formula", async () => {
      setInputValueAndTrigger(document.querySelector(selectors.inputSearch), "2");
      await click(fixture, selectors.checkBoxSearchFormulas);
      setInputValueAndTrigger(document.querySelector(selectors.inputReplace), "4");
      const dispatch = spyDispatch(parent);
      await click(fixture, selectors.replaceButton);
      expect(dispatch).toHaveBeenCalledWith("REPLACE_SEARCH", { replaceWith: "4" });
    });

    test("formulas wont be modified if not looking in formulas or not modifying formulas", async () => {
      setInputValueAndTrigger(document.querySelector(selectors.inputSearch), "4");
      setInputValueAndTrigger(document.querySelector(selectors.inputReplace), "2");
      const dispatch = spyDispatch(parent);
      await click(fixture, selectors.replaceButton);
      expect(dispatch).toHaveBeenCalledWith("REPLACE_SEARCH", { replaceWith: "2" });
    });

    test("can replace all", async () => {
      setInputValueAndTrigger(document.querySelector(selectors.inputSearch), "hell");
      setInputValueAndTrigger(document.querySelector(selectors.inputReplace), "kikou");
      const dispatch = spyDispatch(parent);
      await click(fixture, selectors.replaceAllButton);
      expect(dispatch).toHaveBeenCalledWith("REPLACE_ALL_SEARCH", { replaceWith: "kikou" });
    });

    test("Can replace with Enter key", async () => {
      setInputValueAndTrigger(selectors.inputSearch, "hell");
      setInputValueAndTrigger(selectors.inputReplace, "kikou");
      const dispatch = spyDispatch(parent);
      await focusAndKeyDown(selectors.inputReplace, { key: "Enter" });
      expect(dispatch).toHaveBeenCalledWith("REPLACE_SEARCH", { replaceWith: "kikou" });
    });
  });

  describe("match counts checking", () => {
    beforeEach(async () => {
      jest.useFakeTimers();
      ({ parent, model, fixture } = await mountSpreadsheet());
      parent.env.openSidePanel("FindAndReplace");
      await nextTick();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("match counts return number of search in allSheet, currentSheet and selected range", async () => {
      createSheet(model, { sheetId: "sheet2" });
      setCellContent(model, "A1", "Hello");
      setCellContent(model, "A3", "Hello");
      setCellContent(model, "B1", "Hello");
      setCellContent(model, "A1", "Hello", "sheet2");
      setCellContent(model, "A2", "Hello", "sheet2");
      expect(fixture.querySelector(".o-matches-count")).toBeNull();
      expect(getMatchesCountContent()).toEqual([]);
      inputSearchValue("hello");
      await nextTick();
      expect(getMatchesCountContent()).toEqual(["3 in sheet Sheet1", "5 in all sheets"]);
      changeSearchScope("specificRange");
      await nextTick();
      expect(getMatchesCountContent()).toEqual(["3 in sheet Sheet1", "5 in all sheets"]);
      await simulateClick(selectors.searchRange);
      setInputValueAndTrigger(selectors.searchRange, "A1:B2");
      await nextTick();
      await click(fixture, selectors.confirmSearchRange);
      expect(getMatchesCountContent()).toEqual([
        "2 in range A1:B2 of sheet Sheet1",
        "3 in sheet Sheet1",
        "5 in all sheets",
      ]);
    });
  });
});
