import { Mode } from "../../model";
import { Command } from "../../types/index";
import { UIPlugin } from "../ui_plugin";

export class UIOptionsPlugin extends UIPlugin {
  static modes: Mode[] = ["normal"];
  static getters = ["shouldShowFormulas"];
  private showFormulas: boolean = false;

  // ---------------------------------------------------------------------------
  // Command Handling
  // ---------------------------------------------------------------------------

  handle(cmd: Command) {
    switch (cmd.type) {
      case "SET_FORMULA_VISIBILITY":
        this.showFormulas = cmd.show;
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  shouldShowFormulas(): boolean {
    return this.showFormulas;
  }
}
