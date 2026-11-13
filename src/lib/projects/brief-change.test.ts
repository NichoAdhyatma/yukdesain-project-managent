import { describe, expect, it } from "vitest";
import { briefChangedSinceLastUpdate } from "./brief-change";

// Produksi 13 Nov (Yeni): sketsa dikirim 10.07, klien menambah brief 10.51–10.53, desainer tidak diberi tanda apa pun.
describe("briefChangedSinceLastUpdate", () => {
  const updates = [{ createdAt: "2026-11-13T03:07:00.000Z" }, { createdAt: "2026-11-12T10:00:00.000Z" }];

  it("brief tidak pernah ditambah klien → tidak ada tanda", () => {
    expect(briefChangedSinceLastUpdate(null, updates)).toBeNull();
    expect(briefChangedSinceLastUpdate(undefined, updates)).toBeNull();
  });

  it("tambahan setelah update terakhir → tanda dengan waktu tambahan dan update terakhir", () => {
    expect(briefChangedSinceLastUpdate("2026-11-13T03:53:00.000Z", updates)).toEqual({
      changedAt: "2026-11-13T03:53:00.000Z",
      lastUpdateAt: "2026-11-13T03:07:00.000Z",
    });
  });

  it("desainer sudah mengirim update sesudah tambahan → tanda hilang", () => {
    expect(briefChangedSinceLastUpdate("2026-11-13T02:00:00.000Z", updates)).toBeNull();
  });

  it("belum ada update sama sekali → tetap ditandai", () => {
    expect(briefChangedSinceLastUpdate("2026-11-13T03:53:00.000Z", [])).toEqual({ changedAt: "2026-11-13T03:53:00.000Z", lastUpdateAt: null });
  });
});
