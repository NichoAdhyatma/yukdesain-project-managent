import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ waConversation: { findUnique: vi.fn() }, waIntake: { findFirst: vi.fn() } }));
const push = vi.hoisted(() => ({ notifyOwnersPush: vi.fn() }));
const owners = vi.hoisted(() => ({ listOwnerNumbers: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("./push", () => push);
vi.mock("@/lib/whatsapp/owner/identity", () => owners);

import { notifyNeedsAdmin, notifyNeedsQuote, notifyNewClient } from "./owner-events";

const conv = (over: object = {}) => ({ id: "c1", waId: "6281234567890", profileName: "Sari", isSandbox: false, blockedAt: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  owners.listOwnerNumbers.mockResolvedValue([{ id: "o1", name: "Rizal", waNumber: "6289700000000" }]);
  db.waIntake.findFirst.mockResolvedValue({ id: "i1", clientName: "Sari W", service: { name: "Logo Minimalis" } });
});

describe("kejadian notifikasi owner", () => {
  it("perlu harga: nama klien, layanan, nomor tersamar, tautan order", async () => {
    db.waConversation.findUnique.mockResolvedValue(conv());
    await notifyNeedsQuote("c1");
    expect(push.notifyOwnersPush).toHaveBeenCalledWith("NEEDS_QUOTE", {
      title: "Perlu harga",
      body: "Sari W (6281****7890) · Logo Minimalis",
      url: "/wa-orders/i1",
      tag: "NEEDS_QUOTE:c1",
    });
  });

  it("klien baru tanpa order → tautan ke Inbox", async () => {
    db.waConversation.findUnique.mockResolvedValue(conv());
    db.waIntake.findFirst.mockResolvedValue(null);
    await notifyNewClient("c1");
    expect(push.notifyOwnersPush.mock.calls[0][1]).toMatchObject({ body: "Sari (6281****7890)", url: "/wa-orders?tab=inbox&chat=c1" });
  });

  it("alasan dialihkan ke admin ikut di isi notifikasi", async () => {
    db.waConversation.findUnique.mockResolvedValue(conv());
    await notifyNeedsAdmin("c1", "client_asked");
    expect(push.notifyOwnersPush.mock.calls[0][1].body).toContain("klien minta admin");
  });

  it.each([
    ["Uji bot", { isSandbox: true }],
    ["nomor diblokir", { blockedAt: new Date() }],
    ["nomor owner (tes #klien)", { waId: "6289700000000" }],
  ])("%s → tidak dikirim", async (_label, over) => {
    db.waConversation.findUnique.mockResolvedValue(conv(over));
    await notifyNewClient("c1");
    expect(push.notifyOwnersPush).not.toHaveBeenCalled();
  });
});
