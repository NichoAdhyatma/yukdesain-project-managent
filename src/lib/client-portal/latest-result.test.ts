import { describe, expect, it } from "vitest";
import { pickLatestResult } from "./latest-result";

// Permintaan owner 14 Nov: hasil desain di halaman tracking klien tersembunyi di riwayat yang harus di-expand, dan di
// sana pun hanya berupa link nama file.
const update = (id: string, createdAt: string, filename: string | null, over: object = {}) => ({
  id,
  progress: 50,
  description: `catatan ${id}`,
  createdAt,
  author: { name: "Ivan" },
  attachment: filename ? { id: `a_${id}`, filename, storageKey: `progress/p1/${filename}` } : null,
  ...over,
});

describe("pickLatestResult", () => {
  it("update terbaru yang lampirannya gambar → hasil utama; versi sebelumnya terbaru dulu, maks 3", () => {
    const r = pickLatestResult([
      update("u1", "2026-11-10T01:00:00Z", "v1.png"),
      update("u2", "2026-11-11T01:00:00Z", "v2.jpg"),
      update("u3", "2026-11-12T01:00:00Z", "brief.pdf"),
      update("u4", "2026-11-12T05:00:00Z", "v3.webp", { progress: 90 }),
      update("u5", "2026-11-13T01:00:00Z", null),
      update("u0", "2026-11-09T01:00:00Z", "v0.jpeg"),
    ]);
    expect(r?.latest).toMatchObject({ updateId: "u4", storageKey: "progress/p1/v3.webp", progress: 90, description: "catatan u4", author: "Ivan" });
    expect(r?.earlier.map((e) => e.updateId)).toEqual(["u2", "u1", "u0"]);
  });

  it("lebih dari 3 versi sebelumnya → dipotong 3, jumlah sisanya dicatat", () => {
    const many = ["01", "02", "03", "04", "05", "06"].map((d) => update(`u${d}`, `2026-11-${d}T01:00:00Z`, `v${d}.png`));
    const r = pickLatestResult(many);
    expect(r?.latest.updateId).toBe("u06");
    expect(r?.earlier).toHaveLength(3);
    expect(r?.moreEarlier).toBe(2);
  });

  it("ekstensi huruf besar tetap dikenali sebagai gambar", () => {
    expect(pickLatestResult([update("u1", "2026-11-10T01:00:00Z", "HASIL.PNG")])?.latest.updateId).toBe("u1");
  });

  it("belum ada gambar → null", () => {
    expect(pickLatestResult([update("u1", "2026-11-10T01:00:00Z", "brief.pdf"), update("u2", "2026-11-11T01:00:00Z", null)])).toBeNull();
    expect(pickLatestResult([])).toBeNull();
  });
});
