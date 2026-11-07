import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  waMessage: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  waConversation: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
const resolveOwner = vi.hoisted(() => vi.fn());
vi.mock("./owner/identity", () => ({ resolveOwner }));

import { PHONE_MEDIA_BODY, handleKirimiEcho, isOwnEcho, isPhoneReplyWamid } from "./phone-takeover";

const now = new Date("2026-11-07T09:00:00Z");
const conversation = { id: "c1", waId: "628970000937", mode: "BOT", isSandbox: false };
const echo = (body: string, to: { waId: string | null; lid: string | null } = { waId: "628970000937", lid: null }) => ({ to, body, msgId: "M1" });

beforeEach(() => {
  vi.resetAllMocks();
  db.waMessage.findUnique.mockResolvedValue(null);
  db.waMessage.findMany.mockResolvedValue([]);
  db.waConversation.findUnique.mockResolvedValue(conversation);
  db.waConversation.updateMany.mockResolvedValue({ count: 1 });
  resolveOwner.mockResolvedValue(null);
});

describe("isOwnEcho (docs/WHATSAPP_CHANNEL_KIRIMI.md §10)", () => {
  it("sama dengan pesan bot/portal (spasi diabaikan) → pantulan sendiri", () => {
    expect(isOwnEcho("Halo kak,\n\nmau  desain apa?", ["Halo kak, mau desain apa?"])).toBe(true);
  });
  it("teks panjang yang terpotong/ditambah tetap cocok", () => {
    expect(isOwnEcho("DP sudah kami terima, terima kasih kak", ["DP sudah kami terima, terima kasih kak 🙏"])).toBe(true);
  });
  it("teks berbeda, teks pendek yang hanya awalan, atau media → diketik admin", () => {
    expect(isOwnEcho("Siap kak, saya cek dulu", ["Halo kak, mau desain apa?"])).toBe(false);
    expect(isOwnEcho("ok", ["ok kak siap"])).toBe(false);
    expect(isOwnEcho("Halo kak", ["Halo kak, ada yang bisa kami bantu? Ketik layanan yang dicari ya"])).toBe(false);
    expect(isOwnEcho("", ["apa saja"])).toBe(false);
  });
});

describe("handleKirimiEcho", () => {
  it("pantulan balasan bot → diabaikan, mode tetap", async () => {
    db.waMessage.findMany.mockResolvedValue([{ body: "Halo kak, mau desain apa?" }]);
    expect(await handleKirimiEcho(echo("Halo kak, mau desain apa?"), now)).toBe("own");
    expect(db.waConversation.updateMany).not.toHaveBeenCalled();
    expect(db.waMessage.create).not.toHaveBeenCalled();
  });

  it("admin mengetik dari HP → HUMAN dan pesan dicatat sebagai balasan admin", async () => {
    expect(await handleKirimiEcho(echo("Siap kak, saya cek dulu"), now)).toBe("takeover");
    expect(db.waConversation.updateMany).toHaveBeenCalledWith({ where: { id: "c1", mode: "BOT" }, data: { mode: "HUMAN" } });
    expect(db.waMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ conversationId: "c1", wamid: "kirimi:phone:M1", direction: "OUTBOUND", body: "Siap kak, saya cek dulu", sentByBot: false }),
    });
  });

  it("media dari HP dicatat dengan teks penanda", async () => {
    await handleKirimiEcho(echo(""), now);
    expect(db.waMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ body: PHONE_MEDIA_BODY }) });
  });

  it("kiriman ulang webhook → tidak dicatat dua kali", async () => {
    db.waMessage.findUnique.mockResolvedValue({ id: "m1" });
    expect(await handleKirimiEcho(echo("Siap kak"), now)).toBe("duplicate");
    expect(db.waMessage.create).not.toHaveBeenCalled();
  });

  it("pelanggan lama yang disapa admin lebih dulu → chat baru langsung mode HUMAN", async () => {
    db.waConversation.findUnique.mockResolvedValue(null);
    db.waConversation.upsert.mockResolvedValue({ ...conversation, id: "c2", mode: "HUMAN" });
    db.waConversation.updateMany.mockResolvedValue({ count: 0 });
    expect(await handleKirimiEcho(echo("Halo kak, revisi kemarin sudah jadi"), now)).toBe("already_human");
    expect(db.waConversation.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { waId: "628970000937", mode: "HUMAN", waLid: null } }));
    expect(db.waMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ conversationId: "c2" }) });
  });

  it("pantulan hanya LID → dicari lewat waLid; tidak dikenal → dilewati", async () => {
    db.waConversation.findFirst.mockResolvedValue(conversation);
    expect(await handleKirimiEcho(echo("Siap kak", { waId: null, lid: "123456789012345" }), now)).toBe("takeover");
    expect(db.waConversation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { waLid: "123456789012345", isSandbox: false } }));
    db.waConversation.findFirst.mockResolvedValue(null);
    expect(await handleKirimiEcho(echo("Siap kak", { waId: null, lid: "999999999999999" }), now)).toBe("no_conversation");
  });

  it("chat ke nomor owner tidak dialihkan", async () => {
    resolveOwner.mockResolvedValue({ user: { id: "u1", name: "Owner" }, target: "PUBLISH" });
    expect(await handleKirimiEcho(echo("tes"), now)).toBe("owner");
    expect(db.waConversation.updateMany).not.toHaveBeenCalled();
  });
});

describe("isPhoneReplyWamid", () => {
  it("hanya wamid kirimi:phone:…", () => {
    expect(isPhoneReplyWamid("kirimi:phone:M1")).toBe(true);
    expect(isPhoneReplyWamid("kirimi:yd-1")).toBe(false);
    expect(isPhoneReplyWamid(null)).toBe(false);
  });
});
