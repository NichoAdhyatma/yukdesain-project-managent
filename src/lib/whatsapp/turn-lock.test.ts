import { describe, expect, it } from "vitest";
import { withConversationLock } from "./turn-lock";

// Produksi 14 Nov 12:42 (Ranie): giliran dari pesan klien dan giliran meneruskan jawaban owner berjalan bersamaan;
// satu bilang "logo belum tersimpan, kirim ulang", 5 detik kemudian yang lain bilang "logo sudah masuk".
const tick = () => new Promise((r) => setTimeout(r, 5));

describe("withConversationLock", () => {
  it("giliran chat yang sama berjalan berurutan", async () => {
    const log: string[] = [];
    const a = withConversationLock("c1", async () => {
      log.push("a-start");
      await tick();
      log.push("a-end");
    });
    const b = withConversationLock("c1", async () => {
      log.push("b-start");
      log.push("b-end");
    });
    await Promise.all([a, b]);
    expect(log).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });

  it("chat berbeda tidak saling menunggu", async () => {
    const log: string[] = [];
    const a = withConversationLock("c1", async () => {
      log.push("a-start");
      await tick();
      log.push("a-end");
    });
    const b = withConversationLock("c2", async () => {
      log.push("b-start");
    });
    await Promise.all([a, b]);
    expect(log.indexOf("b-start")).toBeLessThan(log.indexOf("a-end"));
  });

  it("giliran yang gagal tetap melepas antrean dan meneruskan galatnya", async () => {
    await expect(withConversationLock("c3", async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(await withConversationLock("c3", async () => "ok")).toBe("ok");
  });
});
