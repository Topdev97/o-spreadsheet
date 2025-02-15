import { HtmlContent, SelectionIndicatorClass } from "../../../src/components/composer/composer";

const initialSelectionState = {
  isSelectingRange: false,
  position: -1,
};
export class ContentEditableHelper {
  currentState = {
    cursorStart: 0,
    cursorEnd: 0,
  };
  colors = {};
  el: HTMLElement | null = null;
  manualRange: boolean = false;
  selectionState: { isSelectingRange: boolean; position: number } = initialSelectionState;

  updateEl(el: HTMLElement) {
    this.el = el;
    this.currentState = {
      cursorStart: 0,
      cursorEnd: 0,
    };
    this.attachEventHandlers();
    this.colors = {};
  }
  selectRange(start: number, end: number) {
    // TODO: find a way not to depend on selectRange to gain focus and push mockContentHelper
    this.el!.focus();
    // @ts-ignore
    window.mockContentHelper = this;
    this.manualRange = true;
    this.currentState.cursorStart = start;
    this.currentState.cursorEnd = end;
  }

  setText(values: HtmlContent[]) {
    for (const content of values) {
      this.insertText(content.value, { color: content.color, className: content.class });
    }
  }

  insertText(value: string, { color, className }: { color?: string; className?: string } = {}) {
    const text = this.el!.textContent!;
    if (this.manualRange) {
      let start = text.substring(0, this.currentState.cursorStart);
      let end = text.substring(this.currentState.cursorEnd);
      let newValue = start + value + end;
      while (this.el!.firstChild) {
        this.el!.removeChild(this.el!.firstChild);
      }
      this.el!.append(newValue);
    } else {
      this.el!.append(value);
    }
    if (this.currentState.cursorStart === this.currentState.cursorEnd) {
      const position = this.currentState.cursorStart + value.length;
      this.currentState.cursorEnd = position;
      this.currentState.cursorStart = position;
    } else {
      this.currentState.cursorEnd = this.currentState.cursorStart + value.length;
      this.manualRange = false;
    }
    this.colors[value] = color;
    if (className === SelectionIndicatorClass) {
      this.selectionState = {
        isSelectingRange: true,
        position: this.currentState.cursorEnd,
      };
    }
  }
  removeSelection() {
    this.currentState.cursorStart = 0;
    this.currentState.cursorEnd = 0;
  }
  removeAll() {
    this.selectionState = initialSelectionState;
    this.currentState.cursorStart = 0;
    this.currentState.cursorEnd = 0;
    while (this.el!.firstChild) {
      this.el!.removeChild(this.el!.firstChild);
    }
  }
  getCurrentSelection() {
    if (this.manualRange) {
      return { start: this.currentState.cursorStart, end: this.currentState.cursorEnd };
    }
    const v = this.el!.textContent || "";
    return {
      start: v.length,
      end: v.length,
    };
  }

  private attachEventHandlers() {
    if (this.el === null) return;
    this.el.addEventListener("keydown", (ev: KeyboardEvent) => this.onKeyDown(this.el!, ev));
  }

  /**
   * Mock default keydown events
   */
  private onKeyDown(el: HTMLElement, ev: KeyboardEvent) {
    switch (ev.key) {
      case "Home":
        this.currentState.cursorStart = 0;
        this.currentState.cursorEnd = 0;
        break;
      case "End":
        const end = el.textContent ? el.textContent.length : 0;
        this.currentState.cursorStart = end;
        this.currentState.cursorEnd = end;
        break;
      case "ArrowRight":
        this.currentState.cursorEnd += 1;
        this.currentState.cursorStart = ev.shiftKey
          ? this.currentState.cursorStart
          : this.currentState.cursorEnd;
        break;
      case "ArrowLeft":
        this.currentState.cursorEnd -= 1;
        this.currentState.cursorStart = ev.shiftKey
          ? this.currentState.cursorStart
          : this.currentState.cursorEnd;
        break;
    }
  }
}
