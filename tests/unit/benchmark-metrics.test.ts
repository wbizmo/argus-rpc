import { describe, expect, it } from "vitest";

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;

  return sorted[Math.max(0, index)] ?? 0;
}

describe("benchmark metric behavior", () => {
  it("returns zero percentile for empty values", () => {
    expect(percentile([], 95)).toBe(0);
  });

  it("calculates p95 from sorted values", () => {
    expect(percentile([1, 2, 3, 4, 5], 95)).toBe(5);
  });

  it("calculates p95 from unsorted values", () => {
    expect(percentile([10, 2, 7, 4, 1], 95)).toBe(10);
  });
});
