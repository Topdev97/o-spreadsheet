import type { ComponentConstructor } from "@odoo/owl";
import type { Getters } from "./index";
import type { CellPosition, PropsOf } from "./misc";
import type { Rect } from "./rendering";

export type CellPopoverType = "ErrorToolTip" | "LinkDisplay" | "FilterMenu" | "LinkEditor";
export type PopoverPropsPosition = "TopRight" | "BottomLeft";

type MaxSizedComponentConstructor = ComponentConstructor & {
  maxSize?: { maxWidth?: number; maxHeight?: number };
};

/**
 * If the cell at the given position have an associated component (linkDisplay, errorTooltip, ...),
 * returns the parameters to display the component
 */
type CellPopoverBuilder = (
  position: CellPosition,
  getters: Getters
) => CellPopoverComponent<MaxSizedComponentConstructor>;

export interface PopoverBuilders {
  onOpen?: CellPopoverBuilder;
  onHover?: CellPopoverBuilder;
}

export interface ClosedCellPopover {
  isOpen: false;
}

/**
 * Description of a cell component.
 * i.e. which component class, which props and where to
 * display it relative to the cell
 */
type OpenCellPopover<C extends ComponentConstructor> = {
  isOpen: true;
  Component: C;
  props: PropsOf<C>;
  cellCorner: PopoverPropsPosition;
};

export type CellPopoverComponent<
  C extends MaxSizedComponentConstructor = MaxSizedComponentConstructor
> = ClosedCellPopover | OpenCellPopover<C>;

export type PositionedCellPopover<
  C extends MaxSizedComponentConstructor = MaxSizedComponentConstructor
> = {
  isOpen: true;
  Component: C;
  props: PropsOf<C>;
  anchorRect: Rect;
  cellCorner: PopoverPropsPosition;
};
