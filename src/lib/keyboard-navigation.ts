export type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export function arrowOffset(key: ArrowKey): { row: number; column: number } {
  switch (key) {
    case "ArrowUp": return { row: -1, column: 0 };
    case "ArrowDown": return { row: 1, column: 0 };
    case "ArrowLeft": return { row: 0, column: -1 };
    case "ArrowRight": return { row: 0, column: 1 };
  }
}

/** Returns null rather than wrapping horizontally into another row. */
export function nextGridIndex(index: number, key: ArrowKey, length: number, columns: number): number | null {
  if (!Number.isInteger(index) || !Number.isInteger(length) || !Number.isInteger(columns)
    || columns < 1 || index < 0 || index >= length) return null;
  const { row, column } = arrowOffset(key);
  const next = index + row * columns + column;
  if (next < 0 || next >= length) return null;
  if (column !== 0 && Math.floor(index / columns) !== Math.floor(next / columns)) return null;
  return next;
}

export function nextHorizontalIndex(index: number, key: ArrowKey, length: number): number | null {
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  const next = index + (key === "ArrowRight" ? 1 : -1);
  return next >= 0 && next < length ? next : null;
}
