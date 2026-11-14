import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { ownerQuestionText } from "./query-store";

// Produksi 14 Nov (Ikaika): "Bisa dikerjakan? BISA/TIDAK" untuk pertanyaan harga membuat "Tidak" dibaca sebagai
// "pesanan tidak bisa dikerjakan".
describe("ownerQuestionText", () => {
  it("BISA/TIDAK dijawab untuk permintaan di atas saja, bukan untuk seluruh order", () => {
    const text = ownerQuestionText({ clientLabel: "Ikaika (6285****5897)", question: "Apakah harga turun bila menu di bawah 35 item?" });
    expect(text).toContain("Permintaan: Apakah harga turun bila menu di bawah 35 item?");
    expect(text).toContain("*BISA* atau *TIDAK* untuk permintaan di atas");
    expect(text).not.toContain("Bisa dikerjakan?");
  });
});
