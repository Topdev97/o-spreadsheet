import { Component, onMounted, useEffect, useRef, useState } from "@odoo/owl";
import { COMPOSER_ASSISTANT_COLOR, DEFAULT_FONT, NEWLINE } from "../../../constants";
import { functionRegistry } from "../../../functions/index";
import { clip, fuzzyLookup, getZoneArea, isEqual, splitReference } from "../../../helpers/index";
import { ComposerStore } from "./composer_store";

import { EnrichedToken } from "../../../formulas/composer_tokenizer";
import { Store, useStore } from "../../../store_engine";
import { DOMFocusableElementStore } from "../../../stores/DOM_focus_store";
import {
  CSSProperties,
  Color,
  DOMDimension,
  Direction,
  FunctionDescription,
  Rect,
  SpreadsheetChildEnv,
} from "../../../types/index";
import { css, cssPropertiesToCss } from "../../helpers/css";
import { keyboardEventToShortcutString } from "../../helpers/dom_helpers";
import { getHtmlContentFromPattern } from "../../helpers/html_content_helpers";
import { updateSelectionWithArrowKeys } from "../../helpers/selection_helpers";
import { TextValueProvider } from "../autocomplete_dropdown/autocomplete_dropdown";
import { ComposerFocusType } from "../composer_focus_store";
import { ContentEditableHelper } from "../content_editable_helper";
import { FunctionDescriptionProvider } from "../formula_assistant/formula_assistant";

const functions = functionRegistry.content;

const ASSISTANT_WIDTH = 300;

const AUTOCOMPLETE_ENTRIES = 10;

export const selectionIndicatorClass = "selector-flag";
const selectionIndicatorColor = "#a9a9a9";
const selectionIndicator = "␣";

export type HtmlContent = {
  value: string;
  color?: Color;
  class?: string;
};

const functionColor = "#4a4e4d";
const operatorColor = "#3da4ab";

export const tokenColors = {
  OPERATOR: operatorColor,
  NUMBER: "#02c39a",
  STRING: "#00a82d",
  FUNCTION: functionColor,
  DEBUGGER: operatorColor,
  LEFT_PAREN: functionColor,
  RIGHT_PAREN: functionColor,
  ARG_SEPARATOR: functionColor,
  MATCHING_PAREN: "#000000",
};

css/* scss */ `
  .o-composer-container {
    .o-composer {
      overflow-y: auto;
      overflow-x: hidden;
      word-break: break-all;
      padding-right: 2px;

      box-sizing: border-box;
      font-family: ${DEFAULT_FONT};

      caret-color: black;
      padding-left: 3px;
      padding-right: 3px;
      outline: none;

      p {
        margin-bottom: 0px;

        span {
          white-space: pre-wrap;
          &.${selectionIndicatorClass}:after {
            content: "${selectionIndicator}";
            color: ${selectionIndicatorColor};
          }
        }
      }
    }

    .o-composer-assistant {
      position: absolute;
      margin: 1px 4px;
      pointer-events: none;
      overflow: auto;

      .o-semi-bold {
        /** FIXME: to remove in favor of Bootstrap
        * 'fw-semibold' when we upgrade to Bootstrap 5.2
        */
        font-weight: 600 !important;
      }
    }
  }
`;

export interface AutocompleteValue {
  text: string;
  description: string;
}

export interface ComposerProps {
  focus: ComposerFocusType;
  inputStyle?: string;
  rect?: Rect;
  delimitation?: DOMDimension;
  onComposerContentFocused: () => void;
  onComposerCellFocused?: (content: String) => void;
  isDefaultFocus?: boolean;
}

interface ComposerState {
  positionStart: number;
  positionEnd: number;
}

interface AutoCompleteState {
  showProvider: boolean;
  selectedIndex: number | undefined;
  values: AutocompleteValue[];
  type: "function" | "dataValidation";
  getHtmlContent: (text: string) => HtmlContent[];
}

interface FunctionDescriptionState {
  showDescription: boolean;
  functionName: string;
  functionDescription: FunctionDescription;
  argToFocus: number;
}

export class Composer extends Component<ComposerProps, SpreadsheetChildEnv> {
  static template = "o-spreadsheet-Composer";
  static props = {
    focus: {
      validate: (value: string) => ["inactive", "cellFocus", "contentFocus"].includes(value),
    },
    inputStyle: { type: String, optional: true },
    rect: { type: Object, optional: true },
    delimitation: { type: Object, optional: true },
    onComposerCellFocused: { type: Function, optional: true },
    onComposerContentFocused: Function,
    isDefaultFocus: { type: Boolean, optional: true },
  };
  static components = { TextValueProvider, FunctionDescriptionProvider };
  static defaultProps = {
    inputStyle: "",
    isDefaultFocus: false,
  };

  private composerStore!: Store<ComposerStore>;
  private DOMFocusableElementStore!: Store<DOMFocusableElementStore>;

  composerRef = useRef("o_composer");

  contentHelper: ContentEditableHelper = new ContentEditableHelper(this.composerRef.el!);

  composerState: ComposerState = useState({
    positionStart: 0,
    positionEnd: 0,
  });

  autoCompleteState: AutoCompleteState = useState({
    showProvider: false,
    values: [],
    selectedIndex: undefined,
    type: "function",
    getHtmlContent: () => [],
  });

  functionDescriptionState: FunctionDescriptionState = useState({
    showDescription: false,
    functionName: "",
    functionDescription: {} as FunctionDescription,
    argToFocus: 0,
  });
  private compositionActive: boolean = false;

  get assistantStyle(): string {
    const assistantStyle: CSSProperties = {};

    assistantStyle["min-width"] = `${this.props.rect?.width || ASSISTANT_WIDTH}px`;
    if (this.autoCompleteState.type === "function") {
      assistantStyle.width = `${ASSISTANT_WIDTH}px`;
    }

    if (this.props.delimitation && this.props.rect) {
      const { x: cellX, y: cellY, height: cellHeight } = this.props.rect;
      const remainingHeight = this.props.delimitation.height - (cellY + cellHeight);
      assistantStyle["max-height"] = `${remainingHeight}px`;
      if (cellY > remainingHeight) {
        const availableSpaceAbove = cellY;
        assistantStyle["max-height"] = `${availableSpaceAbove}px`;
        // render top
        // We compensate 2 px of margin on the assistant style + 1px for design reasons
        assistantStyle.top = `-3px`;
        assistantStyle.transform = `translate(0, -100%)`;
      }
      if (cellX + ASSISTANT_WIDTH > this.props.delimitation.width) {
        // render left
        assistantStyle.right = `0px`;
      }
    }
    return cssPropertiesToCss(assistantStyle);
  }

  // we can't allow input events to be triggered while we remove and add back the content of the composer in processContent
  shouldProcessInputEvents: boolean = false;
  tokens: EnrichedToken[] = [];

  keyMapping: { [key: string]: Function } = {
    Enter: (ev: KeyboardEvent) => this.processEnterKey(ev, "down"),
    "Shift+Enter": (ev: KeyboardEvent) => this.processEnterKey(ev, "up"),
    "Alt+Enter": this.processNewLineEvent,
    "Ctrl+Enter": this.processNewLineEvent,
    Escape: this.processEscapeKey,
    F2: () => console.warn("Not implemented"),
    F4: this.processF4Key,
    Tab: (ev: KeyboardEvent) => this.processTabKey(ev, "right"),
    "Shift+Tab": (ev: KeyboardEvent) => this.processTabKey(ev, "left"),
  };

  keyCodeMapping: { [keyCode: string]: Function } = {
    NumpadDecimal: this.processNumpadDecimal,
  };

  setup() {
    this.composerStore = useStore(ComposerStore);
    this.DOMFocusableElementStore = useStore(DOMFocusableElementStore);
    onMounted(() => {
      const el = this.composerRef.el!;
      if (this.props.isDefaultFocus) {
        this.DOMFocusableElementStore.setFocusableElement(el);
      }
      this.contentHelper.updateEl(el);
      this.processTokenAtCursor();
    });

    useEffect(() => {
      this.processContent();
    });
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  private processArrowKeys(ev: KeyboardEvent) {
    if (this.composerStore.isSelectingRange || this.composerStore.editionMode === "inactive") {
      this.functionDescriptionState.showDescription = false;
      // Prevent the default content editable behavior which moves the cursor
      ev.preventDefault();
      ev.stopPropagation();
      updateSelectionWithArrowKeys(ev, this.env.model.selection);
      return;
    }
    const content = this.composerStore.currentContent;
    if (
      this.props.focus === "cellFocus" &&
      !this.autoCompleteState.showProvider &&
      !content.startsWith("=")
    ) {
      this.composerStore.stopEdition();
      return;
    }
    // All arrow keys are processed: up and down should move autocomplete, left
    // and right should move the cursor.
    ev.stopPropagation();
    this.handleArrowKeysForAutocomplete(ev);
  }

  private handleArrowKeysForAutocomplete(ev: KeyboardEvent) {
    // only for arrow up and down
    if (["ArrowUp", "ArrowDown"].includes(ev.key) && this.autoCompleteState.showProvider) {
      ev.preventDefault();
      if (this.autoCompleteState.selectedIndex === undefined) {
        this.autoCompleteState.selectedIndex = 0;
        return;
      }
      if (ev.key === "ArrowUp") {
        this.autoCompleteState.selectedIndex--;
        if (this.autoCompleteState.selectedIndex < 0) {
          this.autoCompleteState.selectedIndex = this.autoCompleteState.values.length - 1;
        }
      } else {
        this.autoCompleteState.selectedIndex =
          (this.autoCompleteState.selectedIndex + 1) % this.autoCompleteState.values.length;
      }
    }
  }

  private processTabKey(ev: KeyboardEvent, direction: Direction) {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.composerStore.editionMode !== "inactive") {
      const state = this.autoCompleteState;
      if (state.showProvider && state.selectedIndex !== undefined) {
        const autoCompleteValue = this.autoCompleteState.values[state.selectedIndex]?.text;
        if (autoCompleteValue) {
          this.autoComplete(autoCompleteValue);
          return;
        }
      }
      this.composerStore.stopEdition();
    }
    this.env.model.selection.moveAnchorCell(direction, 1);
  }

  private processEnterKey(ev: KeyboardEvent, direction: Direction) {
    ev.preventDefault();
    ev.stopPropagation();

    const state = this.autoCompleteState;
    if (state.showProvider && state.selectedIndex !== undefined) {
      const autoCompleteValue = this.autoCompleteState.values[state.selectedIndex]?.text;
      if (autoCompleteValue) {
        this.autoComplete(autoCompleteValue);
        return;
      }
    }
    this.composerStore.stopEdition();
    this.env.model.selection.moveAnchorCell(direction, 1);
  }

  private processNewLineEvent(ev: KeyboardEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    const content = this.contentHelper.getText();
    const selection = this.contentHelper.getCurrentSelection();
    const start = Math.min(selection.start, selection.end);
    const end = Math.max(selection.start, selection.end);

    this.composerStore.stopComposerRangeSelection();
    this.composerStore.setCurrentContent(content.slice(0, start) + NEWLINE + content.slice(end), {
      start: start + 1,
      end: start + 1,
    });
    this.processContent();
  }

  private processEscapeKey() {
    this.composerStore.cancelEdition();
  }

  private processF4Key() {
    this.composerStore.cycleReferences();
    this.processContent();
  }

  private processNumpadDecimal(ev: KeyboardEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    const locale = this.env.model.getters.getLocale();
    const selection = this.contentHelper.getCurrentSelection();
    const currentContent = this.composerStore.currentContent;
    const content =
      currentContent.slice(0, selection.start) +
      locale.decimalSeparator +
      currentContent.slice(selection.end);

    // Update composer even by hand rather than dispatching an InputEvent because untrusted inputs
    // events aren't handled natively by contentEditable
    this.composerStore.setCurrentContent(content, {
      start: selection.start + 1,
      end: selection.start + 1,
    });

    // We need to do the process content here in case there is no render between the keyDown and the
    // keyUp event
    this.processContent();
  }

  onCompositionStart() {
    this.compositionActive = true;
  }
  onCompositionEnd() {
    this.compositionActive = false;
  }

  onKeydown(ev: KeyboardEvent) {
    if (this.composerStore.editionMode === "inactive") {
      return;
    }
    if (ev.key.startsWith("Arrow")) {
      this.processArrowKeys(ev);
      return;
    }
    let handler =
      this.keyMapping[keyboardEventToShortcutString(ev)] ||
      this.keyCodeMapping[keyboardEventToShortcutString(ev, "code")];
    if (handler) {
      handler.call(this, ev);
    } else {
      ev.stopPropagation();
    }
  }

  onPaste(ev: ClipboardEvent) {
    if (this.composerStore.editionMode !== "inactive") {
      ev.stopPropagation();
    }
  }

  /*
   * Triggered automatically by the content-editable between the keydown and key up
   * */
  onInput(ev: InputEvent) {
    if (!this.shouldProcessInputEvents) {
      return;
    }
    if (ev.inputType === "insertFromPaste" && this.composerStore.editionMode === "inactive") {
      return;
    }
    ev.stopPropagation();
    let content: string;
    if (this.composerStore.editionMode === "inactive") {
      content = ev.data || "";
    } else {
      content = this.contentHelper.getText();
    }
    if (this.props.focus === "inactive") {
      return this.props.onComposerCellFocused?.(content);
    }
    let selection = this.contentHelper.getCurrentSelection();
    this.composerStore.stopComposerRangeSelection();
    this.composerStore.setCurrentContent(content, selection);
    this.processTokenAtCursor();
  }

  onKeyup(ev: KeyboardEvent) {
    if (this.contentHelper.el === document.activeElement) {
      if (this.autoCompleteState.showProvider && ["ArrowUp", "ArrowDown"].includes(ev.key)) {
        return;
      }

      if (this.composerStore.isSelectingRange && ev.key?.startsWith("Arrow")) {
        return;
      }

      const { start: oldStart, end: oldEnd } = this.composerStore.composerSelection;
      const { start, end } = this.contentHelper.getCurrentSelection();

      if (start !== oldStart || end !== oldEnd) {
        this.composerStore.changeComposerCursorSelection(start, end);
      }

      this.processTokenAtCursor();
    }
  }

  showFunctionAutocomplete(searchTerm: string) {
    const searchTermUpperCase = searchTerm.toUpperCase();
    if (
      !this.composerStore.currentContent.startsWith("=") ||
      searchTermUpperCase === "TRUE" ||
      searchTermUpperCase === "FALSE"
    ) {
      return;
    }
    this.autoCompleteState.showProvider = true;
    this.autoCompleteState.type = "function";
    let values = Object.entries(functionRegistry.content)
      .filter(([_, { hidden }]) => !hidden)
      .map(([text, { description }]) => {
        return {
          text,
          description,
        };
      })
      .sort((a, b) => {
        return a.text.length - b.text.length || a.text.localeCompare(b.text);
      });

    if (searchTerm) {
      values = fuzzyLookup(searchTerm, values, (t) => t.text).slice(0, AUTOCOMPLETE_ENTRIES);
    }
    this.autoCompleteState.values = values.slice(0, AUTOCOMPLETE_ENTRIES);
    this.autoCompleteState.getHtmlContent = (value) =>
      getHtmlContentFromPattern(searchTerm, value, COMPOSER_ASSISTANT_COLOR, "o-semi-bold");
    this.autoCompleteState.selectedIndex = 0;
  }

  updateAutoCompleteIndex(index: number) {
    this.autoCompleteState.selectedIndex = clip(0, index, 10);
  }

  /**
   * This is required to ensure the content helper selection is
   * properly updated on "onclick" events. Depending on the browser,
   * the callback onClick from the composer will be executed before
   * the selection was updated in the dom, which means we capture an
   * wrong selection which is then forced upon the content helper on
   * processContent.
   */
  onMousedown(ev: MouseEvent) {
    if (ev.button > 0) {
      // not main button, probably a context menu
      return;
    }
    this.contentHelper.removeSelection();
  }

  onClick() {
    if (this.env.model.getters.isReadonly()) {
      return;
    }
    const newSelection = this.contentHelper.getCurrentSelection();

    this.composerStore.stopComposerRangeSelection();
    this.props.onComposerContentFocused();

    this.composerStore.changeComposerCursorSelection(newSelection.start, newSelection.end);
    this.processTokenAtCursor();
  }

  onDblClick() {
    if (this.env.model.getters.isReadonly()) {
      return;
    }
    const composerContent = this.composerStore.currentContent;
    const isValidFormula = composerContent.startsWith("=");

    if (isValidFormula) {
      const tokens = this.composerStore.currentTokens;
      const currentSelection = this.contentHelper.getCurrentSelection();
      if (currentSelection.start === currentSelection.end) return;

      const currentSelectedText = composerContent.substring(
        currentSelection.start,
        currentSelection.end
      );
      const token = tokens.filter(
        (token) =>
          token.value.includes(currentSelectedText) &&
          token.start <= currentSelection.start &&
          token.end >= currentSelection.end
      )[0];
      if (!token) {
        return;
      }
      if (token.type === "REFERENCE") {
        this.composerStore.changeComposerCursorSelection(token.start, token.end);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private processContent() {
    if (this.compositionActive) {
      return;
    }
    this.shouldProcessInputEvents = false;
    if (this.props.focus !== "inactive") {
      this.contentHelper.el.focus();
    }
    const content = this.getContentLines();
    this.contentHelper.setText(content);

    if (content.length !== 0 && content.length[0] !== 0) {
      if (this.props.focus !== "inactive") {
        // Put the cursor back where it was before the rendering
        const { start, end } = this.composerStore.composerSelection;
        this.contentHelper.selectRange(start, end);
      }
      this.contentHelper.scrollSelectionIntoView();
    }

    this.shouldProcessInputEvents = true;
  }

  /**
   * Get the HTML content corresponding to the current composer token, divided by lines.
   */
  private getContentLines(): HtmlContent[][] {
    let value = this.composerStore.currentContent;
    const isValidFormula = value.startsWith("=");

    if (value === "") {
      return [];
    } else if (isValidFormula && this.props.focus !== "inactive") {
      return this.splitHtmlContentIntoLines(this.getColoredTokens());
    }
    return this.splitHtmlContentIntoLines([{ value }]);
  }

  private getColoredTokens(): HtmlContent[] {
    const tokens = this.composerStore.currentTokens;
    const tokenAtCursor = this.composerStore.tokenAtCursor;
    const result: HtmlContent[] = [];
    const { end, start } = this.composerStore.composerSelection;
    for (const token of tokens) {
      switch (token.type) {
        case "OPERATOR":
        case "NUMBER":
        case "ARG_SEPARATOR":
        case "STRING":
          result.push({ value: token.value, color: tokenColors[token.type] || "#000" });
          break;
        case "REFERENCE":
          const { xc, sheetName } = splitReference(token.value);
          result.push({ value: token.value, color: this.rangeColor(xc, sheetName) || "#000" });
          break;
        case "SYMBOL":
          const value = token.value;
          const upperCaseValue = value.toUpperCase();
          if (upperCaseValue === "TRUE" || upperCaseValue === "FALSE") {
            result.push({ value: token.value, color: tokenColors.NUMBER });
          } else if (upperCaseValue in functionRegistry.content) {
            result.push({ value: token.value, color: tokenColors.FUNCTION });
          } else {
            result.push({ value: token.value, color: "#000" });
          }
          break;
        case "LEFT_PAREN":
        case "RIGHT_PAREN":
          // Compute the matching parenthesis
          if (
            tokenAtCursor &&
            ["LEFT_PAREN", "RIGHT_PAREN"].includes(tokenAtCursor.type) &&
            tokenAtCursor.parenIndex &&
            tokenAtCursor.parenIndex === token.parenIndex
          ) {
            result.push({ value: token.value, color: tokenColors.MATCHING_PAREN || "#000" });
          } else {
            result.push({ value: token.value, color: tokenColors[token.type] || "#000" });
          }
          break;
        default:
          result.push({ value: token.value, color: "#000" });
          break;
      }
      if (this.composerStore.showSelectionIndicator && end === start && end === token.end) {
        result[result.length - 1].class = selectionIndicatorClass;
      }
    }
    return result;
  }

  /**
   * Split an array of HTMLContents into lines. Each NEWLINE character encountered will create a new
   * line. Contents can be split into multiple parts if they contain multiple NEWLINE characters.
   */
  private splitHtmlContentIntoLines(contents: HtmlContent[]): HtmlContent[][] {
    const contentSplitInLines: HtmlContent[][] = [];
    let currentLine: HtmlContent[] = [];

    for (const content of contents) {
      if (content.value.includes(NEWLINE)) {
        const lines = content.value.split(NEWLINE);
        const lastLine = lines.pop()!;
        for (const line of lines) {
          currentLine.push({ color: content.color, value: line }); // don't copy class, only last line should keep it
          contentSplitInLines.push(currentLine);
          currentLine = [];
        }
        currentLine.push({ ...content, value: lastLine });
      } else {
        currentLine.push(content);
      }
    }
    if (currentLine.length) {
      contentSplitInLines.push(currentLine);
    }

    // Remove useless empty contents
    const filteredLines: HtmlContent[][] = [];
    for (const line of contentSplitInLines) {
      if (line.every(this.isContentEmpty)) {
        filteredLines.push([line[0]]);
      } else {
        filteredLines.push(line.filter((content) => !this.isContentEmpty(content)));
      }
    }

    return filteredLines;
  }

  private isContentEmpty(content: HtmlContent): boolean {
    return !(content.value || content.class);
  }

  private rangeColor(xc: string, sheetName?: string): Color | undefined {
    if (this.props.focus === "inactive") {
      return undefined;
    }
    const highlights = this.composerStore.highlights;
    const refSheet = sheetName
      ? this.env.model.getters.getSheetIdByName(sheetName)
      : this.composerStore.currentEditedCell.sheetId;

    const highlight = highlights.find((highlight) => {
      if (highlight.sheetId !== refSheet) return false;

      const range = this.env.model.getters.getRangeFromSheetXC(refSheet, xc);
      let zone = range.zone;
      zone = getZoneArea(zone) === 1 ? this.env.model.getters.expandZone(refSheet, zone) : zone;
      return isEqual(zone, highlight.zone);
    });
    return highlight && highlight.color ? highlight.color : undefined;
  }

  /**
   * Compute the state of the composer from the tokenAtCursor.
   * If the token is a function or symbol (that isn't a cell/range reference) we have to initialize
   * the autocomplete engine otherwise we initialize the formula assistant.
   */
  private processTokenAtCursor(): void {
    let content = this.composerStore.currentContent;
    this.autoCompleteState.showProvider = false;
    this.functionDescriptionState.showDescription = false;

    const dataValidationAutocompleteValues = this.composerStore.autoCompleteDataValidationValues;
    if (!content.startsWith("=") && dataValidationAutocompleteValues.length) {
      this.showDataValidationAutocomplete(dataValidationAutocompleteValues);
    }

    if (content.startsWith("=")) {
      const token = this.composerStore.tokenAtCursor;
      if (!token) {
        return;
      }
      if (token.type === "SYMBOL") {
        // initialize Autocomplete Dropdown
        this.showFunctionAutocomplete(token.value);
        return;
      }
      const tokenContext = token.functionContext;
      const parentFunction = tokenContext?.parent.toUpperCase();
      if (
        tokenContext &&
        parentFunction &&
        parentFunction in functions &&
        token.type !== "UNKNOWN"
      ) {
        // initialize Formula Assistant
        const description = functions[parentFunction];
        const argPosition = tokenContext.argPosition;

        this.functionDescriptionState.functionName = parentFunction;
        this.functionDescriptionState.functionDescription = description;
        this.functionDescriptionState.argToFocus = description.getArgToFocus(argPosition + 1) - 1;
        this.functionDescriptionState.showDescription = true;
      }
    }
  }

  private autoComplete(value: string) {
    if (!value) {
      return;
    }
    if (this.autoCompleteState.type === "function") {
      const tokenAtCursor = this.composerStore.tokenAtCursor;
      if (tokenAtCursor) {
        let start = tokenAtCursor.end;
        let end = tokenAtCursor.end;

        // shouldn't it be REFERENCE ?
        if (["SYMBOL", "FUNCTION"].includes(tokenAtCursor.type)) {
          start = tokenAtCursor.start;
        }

        const tokens = this.composerStore.currentTokens;
        if (tokens.length) {
          value += "(";

          const currentTokenIndex = tokens.map((token) => token.start).indexOf(tokenAtCursor.start);
          if (currentTokenIndex + 1 < tokens.length) {
            const nextToken = tokens[currentTokenIndex + 1];
            if (nextToken.type === "LEFT_PAREN") {
              end++;
            }
          }
        }

        this.composerStore.changeComposerCursorSelection(start, end);
      }

      this.composerStore.replaceComposerCursorSelection(value);
    } else {
      this.composerStore.setCurrentContent(value);
      this.composerStore.stopEdition();
    }
    this.processTokenAtCursor();
  }

  private showDataValidationAutocomplete(values: string[]) {
    this.autoCompleteState.showProvider = true;
    this.autoCompleteState.type = "dataValidation";
    this.autoCompleteState.selectedIndex = undefined;
    this.autoCompleteState.values = values.map((value) => ({ text: value, description: "" }));
    this.autoCompleteState.getHtmlContent = (value) => [{ value }];
  }
}
