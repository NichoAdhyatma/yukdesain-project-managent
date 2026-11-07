import { describe, expect, it } from "vitest";
import { revisionQuotaRemaining, revisionsUsed } from "./quota";

describe("revisionQuotaRemaining (kuota per project, docs/STUDIO_OPERATIONS.md)", () => {
  it.each([
    [0, 3, 3],
    [1, 3, 2],
    [3, 3, 0],
    [5, 3, 0],
    [2, 5, 3],
    [4, 3, 0],
  ])("%i revisi dari kuota %i → sisa %i", (count, quota, remaining) => {
    expect(revisionQuotaRemaining(count, quota)).toBe(remaining);
  });
});

describe("revisionsUsed", () => {
  it("nomor revisi terakhir = jumlah revisi terpakai (bukan maksimal 1)", () => {
    expect(revisionsUsed(2)).toBe(2);
    expect(revisionsUsed(3)).toBe(3);
    expect(revisionsUsed(null)).toBe(0);
  });
});
