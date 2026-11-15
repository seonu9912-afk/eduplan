import { expect, it } from "vitest";
import { readAllRows } from "../../src/lib/pagination";
it("loads complete curriculum data beyond the API row cap", async () => {
  const source = Array.from({ length: 1206 }, (_, i) => i);
  const calls: number[] = [];
  const result = await readAllRows(async (from, to) => {
    calls.push(from);
    return { data: source.slice(from, to + 1), error: null };
  });
  expect(result.data).toHaveLength(1206);
  expect(calls).toEqual([0, 1000]);
});
it("does not silently return partial data when a later page fails", async () => {
  const result = await readAllRows(
    async (from) =>
      from === 0
        ? { data: [1, 2], error: null }
        : { data: null, error: "network" },
    2,
  );
  expect(result).toEqual({ data: null, error: "network" });
});
