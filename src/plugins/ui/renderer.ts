import { ICONS } from "../../components/icons/icons";
import {
  BACKGROUND_HEADER_ACTIVE_COLOR,
  BACKGROUND_HEADER_COLOR,
  BACKGROUND_HEADER_SELECTED_COLOR,
  CELL_BORDER_COLOR,
  DEFAULT_FONT,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_WEIGHT,
  HEADER_BORDER_COLOR,
  HEADER_FONT_SIZE,
  HEADER_HEIGHT,
  HEADER_WIDTH,
  MIN_CELL_TEXT_MARGIN,
  MIN_CF_ICON_MARGIN,
  TEXT_HEADER_COLOR,
} from "../../constants";
import { fontSizeMap } from "../../fonts";
import { overlap, positionToZone, scrollDelay } from "../../helpers/index";
import {
  Align,
  Box,
  Cell,
  CellValueType,
  EdgeScrollInfo,
  GridRenderingContext,
  Header,
  LAYERS,
  Rect,
  ScrollDirection,
  Sheet,
  UID,
  Viewport,
  Zone,
} from "../../types/index";
import { UIPlugin } from "../ui_plugin";

// -----------------------------------------------------------------------------
// Constants, types, helpers, ...
// -----------------------------------------------------------------------------

function searchIndex(headers: Header[], offset: number): number {
  let left = 0;
  let right = headers.length - 1;
  while (left <= right) {
    const index = Math.floor((left + right) / 2);
    const header = headers[index];
    if (offset < header.start) {
      right = index - 1;
    } else if (offset > header.end) {
      left = index + 1;
    } else if (header.isHidden) {
      left += 1;
    } else {
      return index;
    }
  }
  return -1;
}

export class RendererPlugin extends UIPlugin {
  static layers = [LAYERS.Background, LAYERS.Headers];
  static getters = [
    "getColIndex",
    "getRowIndex",
    "getRect",
    "isVisibleInViewport",
    "getEdgeScrollCol",
    "getEdgeScrollRow",
  ] as const;

  private boxes: Box[] = [];

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  /**
   * Return the index of a column given an offset x and a visible left col index.
   * It returns -1 if no column is found.
   */
  getColIndex(x: number, left: number, sheet?: Sheet): number {
    if (x < 0) {
      return -1;
    }
    const cols = (sheet || this.getters.getActiveSheet()).cols;
    const adjustedX = x + cols[left].start + 1;
    return searchIndex(cols, adjustedX);
  }

  getRowIndex(y: number, top: number, sheet?: Sheet): number {
    if (y < 0) {
      return -1;
    }
    const rows = (sheet || this.getters.getActiveSheet()).rows;
    const adjustedY = y + rows[top].start + 1;
    return searchIndex(rows, adjustedY);
  }

  /**
   * Computes the coordinates and size to draw the zone on the canvas
   */
  getRect(zone: Zone, viewport: Viewport): Rect {
    const { left, top, right, bottom } = zone;
    const { offsetX, offsetY } = this.getShiftedViewport(viewport);
    const { cols, rows } = this.getters.getActiveSheet();
    const x = cols[left].start - offsetX;
    const width = cols[right].end - offsetX - x;
    const y = rows[top].start - offsetY;
    const height = rows[bottom].end - offsetY - y;
    return [x, y, width, height];
  }

  /**
   * Check if a given position is visible in the viewport.
   */
  isVisibleInViewport(col: number, row: number, viewport: Viewport): boolean {
    const { right, left, top, bottom } = viewport;
    return row <= bottom && row >= top && col >= left && col <= right;
  }

  getEdgeScrollCol(x: number): EdgeScrollInfo {
    let canEdgeScroll = false;
    let direction: ScrollDirection = 0;
    let delay = 0;
    const { width } = this.getters.getViewportDimension();
    const { width: gridWidth } = this.getters.getMaxViewportSize(this.getters.getActiveSheet());
    const { left, offsetX } = this.getters.getActiveSnappedViewport();
    if (x < 0 && left > 0) {
      canEdgeScroll = true;
      direction = -1;
      delay = scrollDelay(-x);
    } else if (x > width && offsetX < gridWidth - width) {
      canEdgeScroll = true;
      direction = +1;
      delay = scrollDelay(x - width);
    }

    return { canEdgeScroll, direction, delay };
  }

  getEdgeScrollRow(y: number): EdgeScrollInfo {
    let canEdgeScroll = false;
    let direction: ScrollDirection = 0;
    let delay = 0;
    const { height } = this.getters.getViewportDimension();
    const { height: gridHeight } = this.getters.getMaxViewportSize(this.getters.getActiveSheet());
    const { top, offsetY } = this.getters.getActiveSnappedViewport();
    if (y < 0 && top > 0) {
      canEdgeScroll = true;
      direction = -1;
      delay = scrollDelay(-y);
    } else if (y > height && offsetY < gridHeight - height) {
      canEdgeScroll = true;
      direction = +1;
      delay = scrollDelay(y - height);
    }
    return { canEdgeScroll, direction, delay };
  }

  // ---------------------------------------------------------------------------
  // Grid rendering
  // ---------------------------------------------------------------------------

  drawGrid(renderingContext: GridRenderingContext, layer: LAYERS) {
    switch (layer) {
      case LAYERS.Background:
        this.boxes = this.getGridBoxes(renderingContext);
        this.drawBackground(renderingContext);
        this.drawCellBackground(renderingContext);
        this.drawBorders(renderingContext);
        this.drawTexts(renderingContext);
        this.drawIcon(renderingContext);
        break;
      case LAYERS.Headers:
        if (this.getters.isDashboard()) {
          return;
        }
        this.drawHeaders(renderingContext);
        break;
    }
  }

  private drawBackground(renderingContext: GridRenderingContext) {
    const { ctx, thinLineWidth, viewport } = renderingContext;
    const { width, height } = this.getters.getViewportDimensionWithHeaders();
    const { cols, rows, id: sheetId } = this.getters.getActiveSheet();
    // white background
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);

    // background grid
    const { right, left, top, bottom, offsetX, offsetY } = this.getShiftedViewport(viewport);

    if (!this.getters.getGridLinesVisibility(sheetId) || this.getters.isDashboard()) {
      return;
    }
    ctx.lineWidth = 2 * thinLineWidth;
    ctx.strokeStyle = CELL_BORDER_COLOR;
    ctx.beginPath();

    // vertical lines
    const lineHeight = Math.min(height, rows[bottom].end - offsetY);
    for (let i = left; i <= right; i++) {
      if (cols[i].isHidden) {
        continue;
      }
      const x = cols[i].end - offsetX;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, lineHeight);
    }

    // horizontal lines
    const lineWidth = Math.min(width, cols[right].end - offsetX);
    for (let i = top; i <= bottom; i++) {
      if (rows[i].isHidden) {
        continue;
      }
      const y = rows[i].end - offsetY;
      ctx.moveTo(0, y);
      ctx.lineTo(lineWidth, y);
    }
    ctx.stroke();
  }

  private drawCellBackground(renderingContext: GridRenderingContext) {
    const { ctx, thinLineWidth } = renderingContext;
    ctx.lineWidth = 0.3 * thinLineWidth;
    const inset = 0.1 * thinLineWidth;
    ctx.strokeStyle = "#111";
    const areGridLinesVisible = this.getters.getGridLinesVisibility(
      this.getters.getActiveSheetId()
    );
    for (let box of this.boxes) {
      // fill color
      let style = box.style;
      if ((style.fillColor && style.fillColor !== "#ffffff") || box.isMerge) {
        ctx.fillStyle = style.fillColor || "#ffffff";
        ctx.fillRect(box.x, box.y, box.width, box.height);
        if (areGridLinesVisible) {
          ctx.strokeRect(
            box.x + inset,
            box.y + inset,
            box.width - 2 * inset,
            box.height - 2 * inset
          );
        }
      }
      if (box.error) {
        ctx.fillStyle = "red";
        ctx.beginPath();
        ctx.moveTo(box.x + box.width - 5, box.y);
        ctx.lineTo(box.x + box.width, box.y);
        ctx.lineTo(box.x + box.width, box.y + 5);
        ctx.fill();
      }
    }
  }

  private drawBorders(renderingContext: GridRenderingContext) {
    const { ctx, thinLineWidth } = renderingContext;
    for (let box of this.boxes) {
      // fill color
      let border = box.border;
      if (border) {
        const { x, y, width, height } = box;
        if (border.left) {
          drawBorder(border.left, x, y, x, y + height);
        }
        if (border.top) {
          drawBorder(border.top, x, y, x + width, y);
        }
        if (border.right) {
          drawBorder(border.right, x + width, y, x + width, y + height);
        }
        if (border.bottom) {
          drawBorder(border.bottom, x, y + height, x + width, y + height);
        }
      }
    }

    function drawBorder([style, color], x1, y1, x2, y2) {
      ctx.strokeStyle = color;
      ctx.lineWidth = (style === "thin" ? 2 : 3) * thinLineWidth;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  private drawTexts(renderingContext: GridRenderingContext) {
    const { ctx, thinLineWidth } = renderingContext;
    ctx.textBaseline = "middle";
    let currentFont;
    for (let box of this.boxes) {
      if (box.content) {
        const style = box.style || {};
        const align = box.content.align || "left";
        const italic = style.italic ? "italic " : "";
        const weight = style.bold ? "bold" : DEFAULT_FONT_WEIGHT;
        const sizeInPt = style.fontSize || DEFAULT_FONT_SIZE;
        const size = fontSizeMap[sizeInPt];
        const font = `${italic}${weight} ${size}px ${DEFAULT_FONT}`;
        if (font !== currentFont) {
          currentFont = font;
          ctx.font = font;
        }
        ctx.fillStyle = style.textColor || "#000";
        let x: number;
        let y = box.y + box.height / 2 + 1;
        if (align === "left") {
          x = box.x + (box.image ? box.image.size + 2 * MIN_CF_ICON_MARGIN : MIN_CELL_TEXT_MARGIN);
        } else if (align === "right") {
          x = box.x + box.width - MIN_CELL_TEXT_MARGIN;
        } else {
          x = box.x + box.width / 2;
        }
        ctx.textAlign = align;
        if (box.clipRect) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(...box.clipRect);
          ctx.clip();
        }
        ctx.fillText(box.content.text, Math.round(x), Math.round(y));
        if (style.strikethrough || style.underline) {
          if (align === "right") {
            x = x - box.content.width;
          } else if (align === "center") {
            x = x - box.content.width / 2;
          }
          if (style.strikethrough) {
            ctx.fillRect(x, y, box.content.width, 2.6 * thinLineWidth);
          }
          if (style.underline) {
            y = box.y + box.height / 2 + 1 + size / 2;
            ctx.fillRect(x, y, box.content.width, 1.3 * thinLineWidth);
          }
        }
        if (box.clipRect) {
          ctx.restore();
        }
      }
    }
  }

  private drawIcon(renderingContext: GridRenderingContext) {
    const { ctx } = renderingContext;
    for (const box of this.boxes) {
      if (box.image) {
        const icon: HTMLImageElement = box.image.image;
        const size = box.image.size;
        const margin = (box.height - size) / 2;
        if (box.image.clipIcon) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(...box.image.clipIcon);
          ctx.clip();
        }
        ctx.drawImage(icon, box.x + MIN_CF_ICON_MARGIN, box.y + margin, size, size);
        if (box.image.clipIcon) {
          ctx.restore();
        }
      }
    }
  }

  private drawHeaders(renderingContext: GridRenderingContext) {
    const { ctx, thinLineWidth, viewport } = renderingContext;
    const { right, left, top, bottom, offsetX, offsetY } = this.getShiftedViewport(viewport);
    const { width, height } = this.getters.getViewportDimensionWithHeaders();
    const selection = this.getters.getSelectedZones();
    const { cols, rows } = this.getters.getActiveSheet();
    const activeCols = this.getters.getActiveCols();
    const activeRows = this.getters.getActiveRows();

    ctx.fillStyle = BACKGROUND_HEADER_COLOR;
    ctx.font = `400 ${HEADER_FONT_SIZE}px ${DEFAULT_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = thinLineWidth;
    ctx.strokeStyle = "#333";

    // background
    ctx.fillRect(0, 0, width, HEADER_HEIGHT);
    ctx.fillRect(0, 0, HEADER_WIDTH, height);
    // selection background
    ctx.fillStyle = BACKGROUND_HEADER_SELECTED_COLOR;
    for (let zone of selection) {
      const x1 = Math.max(HEADER_WIDTH, cols[zone.left].start - offsetX);
      const x2 = Math.max(HEADER_WIDTH, cols[zone.right].end - offsetX);
      const y1 = Math.max(HEADER_HEIGHT, rows[zone.top].start - offsetY);
      const y2 = Math.max(HEADER_HEIGHT, rows[zone.bottom].end - offsetY);
      ctx.fillStyle = activeCols.has(zone.left)
        ? BACKGROUND_HEADER_ACTIVE_COLOR
        : BACKGROUND_HEADER_SELECTED_COLOR;
      ctx.fillRect(x1, 0, x2 - x1, HEADER_HEIGHT);
      ctx.fillStyle = activeRows.has(zone.top)
        ? BACKGROUND_HEADER_ACTIVE_COLOR
        : BACKGROUND_HEADER_SELECTED_COLOR;
      ctx.fillRect(0, y1, HEADER_WIDTH, y2 - y1);
    }

    // 2 main lines
    ctx.beginPath();
    ctx.moveTo(HEADER_WIDTH, 0);
    ctx.lineTo(HEADER_WIDTH, height);
    ctx.moveTo(0, HEADER_HEIGHT);
    ctx.lineTo(width, HEADER_HEIGHT);
    ctx.strokeStyle = HEADER_BORDER_COLOR;
    ctx.stroke();

    ctx.beginPath();

    // column text + separator
    for (let i = left; i <= right; i++) {
      const col = cols[i];
      if (col.isHidden) {
        continue;
      }
      ctx.fillStyle = activeCols.has(i) ? "#fff" : TEXT_HEADER_COLOR;
      ctx.fillText(col.name, (col.start + col.end) / 2 - offsetX, HEADER_HEIGHT / 2);
      ctx.moveTo(col.end - offsetX, 0);
      ctx.lineTo(col.end - offsetX, HEADER_HEIGHT);
    }
    // row text + separator
    for (let i = top; i <= bottom; i++) {
      const row = rows[i];
      if (row.isHidden) {
        continue;
      }
      ctx.fillStyle = activeRows.has(i) ? "#fff" : TEXT_HEADER_COLOR;

      ctx.fillText(row.name, HEADER_WIDTH / 2, (row.start + row.end) / 2 - offsetY);
      ctx.moveTo(0, row.end - offsetY);
      ctx.lineTo(HEADER_WIDTH, row.end - offsetY);
    }

    ctx.stroke();
  }

  private hasContent(col: number, row: number): boolean {
    const sheetId = this.getters.getActiveSheetId();
    const cell = this.getters.getCell(sheetId, col, row);
    return (cell && !cell.isEmpty()) || this.getters.isInMerge(sheetId, col, row);
  }

  /**
   * Adapt the current viewport with the headers sizes
   */
  private getShiftedViewport(viewport: Viewport): Viewport {
    const shiftX = this.getters.isDashboard() ? 0 : HEADER_WIDTH;
    const shiftY = this.getters.isDashboard() ? 0 : HEADER_HEIGHT;
    return {
      ...viewport,
      offsetX: viewport.offsetX - shiftX,
      offsetY: viewport.offsetY - shiftY,
    };
  }

  private findNextEmptyCol(base: number, max: number, row: number): number {
    let col = base;
    while (col < max && !this.hasContent(col + 1, row)) {
      col++;
    }
    return col;
  }

  private findPreviousEmptyCol(base: number, min: number, row: number): number {
    let col = base;
    while (col > min && !this.hasContent(col - 1, row)) {
      col--;
    }
    return col;
  }

  private computeCellAlignment(cell: Cell, isOverflowing: boolean): Align {
    if (cell.isFormula() && this.getters.shouldShowFormulas()) {
      return "left";
    }
    const { align } = this.getters.getCellStyle(cell);
    if (isOverflowing && cell.evaluated.type === CellValueType.number) {
      return align !== "center" ? "left" : align;
    }
    return align || cell.defaultAlign;
  }

  private createZoneBox(sheetId: UID, zone: Zone, viewport: Viewport): Box {
    const { right, left, offsetX } = this.getShiftedViewport(viewport);
    const colNumber = zone.left;
    const rowNumber = zone.top;
    const col = this.getters.getCol(sheetId, colNumber);
    const row = this.getters.getRow(sheetId, rowNumber);
    const cell = this.getters.getCell(sheetId, colNumber, rowNumber);
    const showFormula = this.getters.shouldShowFormulas();
    const [x, y, width, height] = this.getRect(zone, viewport);

    const box: Box = {
      x,
      y,
      width,
      height,
      border: this.getters.getCellBorder(sheetId, colNumber, rowNumber) || undefined,
      style: {
        ...this.getters.getCellStyle(cell),
        ...this.getters.getConditionalStyle(colNumber, rowNumber),
      },
    };

    if (!cell) {
      return box;
    }
    /** Icon CF */
    const cfIcon = this.getters.getConditionalIcon(colNumber, rowNumber);
    const fontSize = box.style.fontSize || DEFAULT_FONT_SIZE;
    const fontSizePX = fontSizeMap[fontSize];
    const iconBoxWidth = cfIcon ? 2 * MIN_CF_ICON_MARGIN + fontSizePX : 0;
    if (cfIcon) {
      box.image = {
        type: "icon",
        size: fontSizePX,
        clipIcon: [box.x, box.y, Math.min(iconBoxWidth, width), height],
        image: ICONS[cfIcon].img,
      };
    }

    /** Content */
    const text = this.getters.getCellText(cell, showFormula);
    const textWidth = this.getters.getTextWidth(cell);
    const contentWidth = iconBoxWidth + textWidth;
    const align = this.computeCellAlignment(cell, contentWidth > width);
    box.content = {
      text,
      width: textWidth,
      align,
    };

    /** Error */
    if (cell.evaluated.type === CellValueType.error) {
      box.error = cell.evaluated.error;
    }

    /** ClipRect */
    const isOverflowing = contentWidth > width || fontSizeMap[fontSize] > height;
    if (cfIcon) {
      box.clipRect = [box.x + iconBoxWidth, box.y, Math.max(0, width - iconBoxWidth), height];
    } else if (isOverflowing) {
      let nextColIndex: number, previousColIndex: number;

      const isCellInMerge = this.getters.isInMerge(sheetId, colNumber, rowNumber);
      if (isCellInMerge) {
        // Always clip merges
        nextColIndex = this.getters.getMerge(sheetId, colNumber, rowNumber)!.right;
        previousColIndex = colNumber;
      } else {
        nextColIndex = this.findNextEmptyCol(colNumber, right, rowNumber);
        previousColIndex = this.findPreviousEmptyCol(colNumber, left, rowNumber);
      }

      switch (align) {
        case "left": {
          const nextCol = this.getters.getCol(sheetId, nextColIndex);
          const clipWidth = nextCol.end - col.start;
          if (clipWidth < textWidth || fontSizePX > row.size) {
            box.clipRect = [x, y, clipWidth, height];
          }
          break;
        }
        case "right": {
          const previousCol = this.getters.getCol(sheetId, previousColIndex);
          const clipWidth = col.end + width - col.size - previousCol.start;
          if (clipWidth < textWidth || fontSizePX > row.size) {
            box.clipRect = [previousCol.start - offsetX, y, clipWidth, height];
          }
          break;
        }
        case "center": {
          const previousCol = this.getters.getCol(sheetId, previousColIndex);
          const nextCol = this.getters.getCol(sheetId, nextColIndex);
          const clipWidth = nextCol.end - previousCol.start;
          if (
            clipWidth < textWidth ||
            previousColIndex === colNumber ||
            nextColIndex === colNumber ||
            fontSizePX > row.size
          ) {
            box.clipRect = [previousCol.start - offsetX, y, clipWidth, height];
          }
          break;
        }
      }
    }
    return box;
  }

  private getGridBoxes(renderingContext: GridRenderingContext): Box[] {
    const boxes: Box[] = [];

    const { viewport } = renderingContext;
    const { right, left, top, bottom } = this.getShiftedViewport(viewport);
    const sheetId = this.getters.getActiveSheetId();

    for (let rowNumber = top; rowNumber <= bottom; rowNumber++) {
      const row = this.getters.getRow(sheetId, rowNumber);
      if (row.isHidden) {
        continue;
      }
      for (let colNumber = left; colNumber <= right; colNumber++) {
        const col = this.getters.getCol(sheetId, colNumber);
        if (col.isHidden) {
          continue;
        }
        if (this.getters.isInMerge(sheetId, colNumber, rowNumber)) {
          continue;
        }
        boxes.push(
          this.createZoneBox(sheetId, positionToZone({ col: colNumber, row: rowNumber }), viewport)
        );
      }
    }
    for (const merge of this.getters.getMerges(sheetId)) {
      if (this.getters.isMergeHidden(sheetId, merge)) {
        continue;
      }
      if (overlap(merge, viewport)) {
        const box = this.createZoneBox(sheetId, merge, viewport);
        const borderBottomRight = this.getters.getCellBorder(sheetId, merge.right, merge.bottom);
        box.border = {
          ...box.border,
          bottom: borderBottomRight ? borderBottomRight.bottom : undefined,
          right: borderBottomRight ? borderBottomRight.right : undefined,
        };
        box.isMerge = true;
        boxes.push(box);
      }
    }
    return boxes;
  }
}
