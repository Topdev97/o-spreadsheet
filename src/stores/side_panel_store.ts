import { Component } from "@odoo/owl";
import { sidePanelRegistry } from "../registries";
import { StoreConfig } from "./providers";

interface OpenedSidePanel {
  isOpen: true;
  title: string;
  Body: Component;
  Footer?: Component;
  panelProps: object;
}

interface ClosedSidePanel {
  isOpen: false;
}

type SidePanel = OpenedSidePanel | ClosedSidePanel;

interface InternalState {
  panelProps: object;
  sidePanelKey?: string;
}

class SidePanelActions {
  constructor(private state: InternalState) {}

  open(sidePanelKey: string, props: object) {
    this.state.panelProps = props;
    this.state.sidePanelKey = sidePanelKey;
  }

  toggle(sidePanelKey: string, props: object) {
    if (sidePanelKey === this.state.sidePanelKey) {
      this.close();
    } else {
      this.open(sidePanelKey, props);
    }
  }

  close() {
    this.state.sidePanelKey = undefined;
    this.state.panelProps = {};
  }
}

export const sidePanelProvider: () => StoreConfig<InternalState, SidePanel, SidePanelActions> =
  () => ({
    actions: SidePanelActions,
    state: {
      panelProps: {},
    },
    computePublicState: (state) => {
      if (state.sidePanelKey === undefined) {
        return { isOpen: false };
      }
      const content = sidePanelRegistry.get(state.sidePanelKey);
      return {
        isOpen: true,
        Body: content.Body,
        Footer: content.Footer,
        title: content.title,
        panelProps: state.panelProps,
      };
    },
  });
