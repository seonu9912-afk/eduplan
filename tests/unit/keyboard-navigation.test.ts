import { describe, expect, it } from "vitest";
import { arrowOffset, nextGridIndex, nextHorizontalIndex } from "../../src/lib/keyboard-navigation";

describe("keyboard grid navigation", () => {
  it("moves in all four directions without wrapping horizontally", () => {
    expect(arrowOffset("ArrowUp")).toEqual({ row: -1, column: 0 });
    expect(arrowOffset("ArrowDown")).toEqual({ row: 1, column: 0 });
    expect(nextGridIndex(9, "ArrowRight", 35, 7)).toBe(10);
    expect(nextGridIndex(9, "ArrowLeft", 35, 7)).toBe(8);
    expect(nextGridIndex(9, "ArrowUp", 35, 7)).toBe(2);
    expect(nextGridIndex(9, "ArrowDown", 35, 7)).toBe(16);
    expect(nextGridIndex(6, "ArrowRight", 35, 7)).toBeNull();
    expect(nextGridIndex(7, "ArrowLeft", 35, 7)).toBeNull();
  });
  it("stops at the edges and rejects invalid coordinates", () => {
    expect(nextGridIndex(0, "ArrowUp", 35, 7)).toBeNull();
    expect(nextGridIndex(34, "ArrowDown", 35, 7)).toBeNull();
    expect(nextGridIndex(35, "ArrowLeft", 35, 7)).toBeNull();
    expect(nextGridIndex(3, "ArrowRight", 10, 0)).toBeNull();
  });
  it("moves across tabs, not between unrelated vertical groups", () => {
    expect(nextHorizontalIndex(2, "ArrowLeft", 4)).toBe(1);
    expect(nextHorizontalIndex(2, "ArrowRight", 4)).toBe(3);
    expect(nextHorizontalIndex(0, "ArrowLeft", 4)).toBeNull();
    expect(nextHorizontalIndex(3, "ArrowRight", 4)).toBeNull();
    expect(nextHorizontalIndex(2, "ArrowDown", 4)).toBeNull();
  });
});
