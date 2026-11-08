import { describe, expect, it } from "vitest";
import { CLIENT_PROJECT_STATUS, workProgressPercent } from "./project-progress";

const at = (iso: string) => new Date(iso).toISOString();

describe("CLIENT_PROJECT_STATUS (label status di portal klien)", () => {
  it("brief sudah masuk tapi belum dikerjakan ≠ menunggu brief", () => {
    expect(CLIENT_PROJECT_STATUS.DRAFT.label).toBe("Menunggu Brief");
    expect(CLIENT_PROJECT_STATUS.BELUM_DIKERJAKAN.label).toBe("Belum Dikerjakan");
    expect(CLIENT_PROJECT_STATUS.BELUM_DIKERJAKAN.description).not.toMatch(/brief dari client/i);
    expect(CLIENT_PROJECT_STATUS.SEDANG_DIKERJAKAN.label).toBe("Sedang Dikerjakan");
    expect(CLIENT_PROJECT_STATUS.SELESAI.label).toBe("Selesai");
  });
});

describe("workProgressPercent: progres pengerjaan, bukan pembayaran", () => {
  const base = { finalApprovedAt: null, updates: [] as { progress: number | null; createdAt: string }[] };

  it("belum dikerjakan → 0 walau sudah lunas", () => {
    expect(workProgressPercent({ ...base, status: "DRAFT" })).toBe(0);
    expect(workProgressPercent({ ...base, status: "BELUM_DIKERJAKAN", updates: [{ progress: 30, createdAt: at("2026-11-07") }] })).toBe(0);
  });

  it("sedang dikerjakan → progres update terbaru dari desainer", () => {
    const updates = [
      { progress: 20, createdAt: at("2026-11-05T01:00:00Z") },
      { progress: 59, createdAt: at("2026-11-07T01:00:00Z") },
      { progress: null, createdAt: at("2026-11-08T01:00:00Z") },
    ];
    expect(workProgressPercent({ ...base, status: "SEDANG_DIKERJAKAN", updates })).toBe(59);
    expect(workProgressPercent({ ...base, status: "SEDANG_DIKERJAKAN" })).toBe(0);
  });

  it("nilai di luar 0–100 dipotong", () => {
    expect(workProgressPercent({ ...base, status: "SEDANG_DIKERJAKAN", updates: [{ progress: 140, createdAt: at("2026-11-07") }] })).toBe(100);
  });

  it("selesai atau final disetujui → 100", () => {
    expect(workProgressPercent({ ...base, status: "SELESAI" })).toBe(100);
    expect(workProgressPercent({ ...base, status: "SEDANG_DIKERJAKAN", finalApprovedAt: at("2026-11-08") })).toBe(100);
  });
});
