import { Component } from "@odoo/owl";
import {
  DEFAULT_VERTICAL_ALIGN,
  GRID_ICON_EDGE_LENGTH,
  GRID_ICON_MARGIN,
  HEADER_HEIGHT,
  HEADER_WIDTH,
} from "../../constants";
import { positionToZone } from "../../helpers";
import { Align, CellPosition, Rect, SpreadsheetChildEnv, VerticalAlign } from "../../types";
import { css, cssPropertiesToCss } from "../helpers";

css/* scss */ `
  .o-grid-cell-icon {
    width: ${GRID_ICON_EDGE_LENGTH}px;
    height: ${GRID_ICON_EDGE_LENGTH}px;
  }
`;

export interface GridCellIconProps {
  cellPosition: CellPosition;
  horizontalAlign?: Align;
  verticalAlign?: VerticalAlign;
}

export class GridCellIcon extends Component<GridCellIconProps, SpreadsheetChildEnv> {
  static template = "o-spreadsheet-GridCellIcon";
  static props = {
    cellPosition: Object,
    horizontalAlign: { type: String, optional: true },
    verticalAlign: { type: String, optional: true },
    slots: Object,
  };

  get iconStyle(): string {
    const cellPosition = this.props.cellPosition;
    const merge = this.env.model.getters.getMerge(cellPosition);
    const zone = merge || positionToZone(cellPosition);
    const rect = this.env.model.getters.getVisibleRect(zone);
    const x = this.getIconHorizontalPosition(rect, cellPosition, "right");
    const y = this.getIconVerticalPosition(rect, cellPosition, undefined);
    return cssPropertiesToCss({
      top: `${y - HEADER_HEIGHT}px`, // ADRM TODO: doesn't work in dashboard. Create a getter getVisibleRectWithoutHeaders or something.
      left: `${x - HEADER_WIDTH}px`,
    });
  }

  private getIconVerticalPosition(
    rect: Rect,
    cellPosition: CellPosition,
    verticalAlign: VerticalAlign
  ): number {
    const start = rect.y;
    const end = rect.y + rect.height;

    const cell = this.env.model.getters.getCell(cellPosition);
    const align = verticalAlign || cell?.style?.verticalAlign || DEFAULT_VERTICAL_ALIGN;

    switch (align) {
      case "bottom":
        return end - GRID_ICON_MARGIN - GRID_ICON_EDGE_LENGTH;
      case "top":
        return start + GRID_ICON_MARGIN;
      default:
        const centeringOffset = Math.floor((end - start - GRID_ICON_EDGE_LENGTH) / 2);
        return end - GRID_ICON_EDGE_LENGTH - centeringOffset;
    }
  }

  private getIconHorizontalPosition(
    rect: Rect,
    cellPosition: CellPosition,
    horizontalAlign: Align
  ): number {
    const start = rect.x;
    const end = rect.x + rect.width;

    const cell = this.env.model.getters.getCell(cellPosition);
    const evaluatedCell = this.env.model.getters.getEvaluatedCell(cellPosition);
    const align = horizontalAlign || cell?.style?.align || evaluatedCell.defaultAlign;

    switch (align) {
      case "right":
        return end - GRID_ICON_MARGIN - GRID_ICON_EDGE_LENGTH;
      case "left":
        return start + GRID_ICON_MARGIN;
      default:
        const centeringOffset = Math.floor((end - start - GRID_ICON_EDGE_LENGTH) / 2);
        return end - GRID_ICON_EDGE_LENGTH - centeringOffset;
    }
  }

  isPositionVisible(position: CellPosition): boolean {
    const rect = this.env.model.getters.getVisibleRect(positionToZone(position));
    return !(rect.width === 0 || rect.height === 0);
  }
}
