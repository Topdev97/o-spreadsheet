import { Workbook } from "./types";
import { updateState } from "./history";
import { getActiveCols, getActiveRows } from "./selection";

/**
 * Update the size of the given column, by adding a delta (can be negative)
 * @param state GridState
 * @param index Index of the column
 * @param delta Delta add to the size
 */
export function updateColSize(state: Workbook, index: number, delta: number) {
  const { cols } = state;
  const col = cols[index];
  updateState(state, ["cols", index, "size"], col.size + delta);
  updateState(state, ["cols", index, "right"], col.right + delta);
  for (let i = index + 1; i < state.cols.length; i++) {
    const col = cols[i];
    updateState(state, ["cols", i, "left"], col.left + delta);
    updateState(state, ["cols", i, "right"], col.right + delta);
  }
  state.width += delta;
}
/**
 * Update the size of the given row, by adding a delta (can be negative)
 * @param state GridState
 * @param index Index of the row
 * @param delta Delta add to the size
 */
export function updateRowSize(state: Workbook, index: number, delta: number) {
  const { rows } = state;
  const row = rows[index];
  updateState(state, ["rows", index, "size"], row.size + delta);
  updateState(state, ["rows", index, "bottom"], row.bottom + delta);
  for (let i = index + 1; i < state.rows.length; i++) {
    const row = rows[i];
    updateState(state, ["rows", i, "top"], row.top + delta);
    updateState(state, ["rows", i, "bottom"], row.bottom + delta);
  }
  state.height += delta;
}

/**
 * Update the size of multiple columns, based on the size of one column.
 * The delta is added to the size of the based column, and the size of the others
 * columns is set to this size.
 *
 * @param state GridState
 * @param base Index of the based column
 * @param delta Delta to add to the size of the based column
 */
export function updateColsSize(state: Workbook, base: number, delta: number) {
  const { cols } = state;
  const col = cols[base];
  const size = col.size + delta;
  updateColSize(state, base, delta);
  const activeCols = getActiveCols(state);
  if (activeCols.has(base)) {
    for (let col of activeCols) {
      updateColSize(state, col, size - cols[col].size);
    }
  }
}

/**
 * Update the size of multiple rows, based on the size of one row.
 * The delta is added to the size of the based row, and the size of the others
 * rows is set to this size.
 *
 * @param state GridState
 * @param base Index of the based row
 * @param delta Delta to add to the size of the based row
 */
export function updateRowsSize(state: Workbook, base: number, delta: number) {
  const { rows } = state;
  const row = rows[base];
  const size = row.size + delta;
  updateRowSize(state, base, delta);
  const activeRows = getActiveRows(state);
  if (activeRows.has(base)) {
    for (let row of activeRows) {
      updateRowSize(state, row, size - rows[row].size);
    }
  }
}

export function setColSize(state: Workbook, col: number, size: number) {
  updateColSize(state, col, size - state.cols[col].size);
}

export function setRowSize(state: Workbook, row: number, size: number) {
  updateRowSize(state, row, size - state.rows[row].size);
}

export function autoresizeCols(
  state: Workbook,
  col: number,
  getMaxSize: (col: boolean, index: number) => number
) {
  let activeCols = getActiveCols(state);
  if (!activeCols.has(col)) {
    activeCols = new Set<number>([col]);
  }
  for (let elt of activeCols) {
    const size = getMaxSize(true, elt);
    if (size !== 0) {
      setColSize(state, elt, size);
    }
  }
}

export function autoresizeRows(
  state: Workbook,
  row: number,
  getMaxSize: (col: boolean, index: number) => number
) {
  let activeRows = getActiveRows(state);
  if (!activeRows.has(row)) {
    activeRows = new Set<number>([row]);
  }
  for (let elt of activeRows) {
    const size = getMaxSize(false, elt);
    if (size !== 0) {
      setRowSize(state, elt, size);
    }
  }
}
