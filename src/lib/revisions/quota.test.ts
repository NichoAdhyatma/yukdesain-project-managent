import { describe, expect, it } from "vitest";
import { revisionQuotaRemaining } from "./quota";

describe("revisionQuotaRemaining", () => {
  it.each([
    [0, 3],
    [1, 2],
    [3, 0],
    [5, 0],
  ])("%i revisi → sisa %i", (count, remaining) => {
    expect(revisionQuotaRemaining(count)).toBe(remaining);
  });
});
