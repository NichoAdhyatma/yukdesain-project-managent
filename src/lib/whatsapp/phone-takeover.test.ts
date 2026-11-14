import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  waMessage: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  waConversation: { findMany: vi.fn(), updateMany: vi.fn() },
  studioSettings: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
const owners = vi.hoisted(() => ({ listOwnerNumbers: vi.fn() }));
vi.mock("./owner/identity", () => owners);
const push = vi.hoisted(() => ({ notifyOwnersPush: vi.fn() }));
vi.mock("@/lib/notifications/push", () => push);

import { PHONE_MEDIA_BODY, handleKirimiEcho, isOwnEcho, isPhoneReplyWamid, resetPhoneReplyNotifyThrottle } from "./phone-takeover";

const now = new Date("2026-11-08T05:00:00Z");
const conv = (id: string, over: object = {}) => ({
  id,
  waId: `62812000000${id.length}${id}`,
  profileName: `Klien ${id}`,
  mode: "BOT",
  ownerActsAsClient: false,
  ...over,
});
// Pantulan perangkat Kirimi D-CZIKM: `from` = nomor perangkat sendiri, tanpa nomor klien (2026-11-08).
const echo = (body: string) => ({ to: { waId: "6281233828235", lid: null }, body, msgId: "M1" });

beforeEach(() => {
  vi.resetAllMocks();
  resetPhoneReplyNotifyThrottle();
  db.waMessage.findUnique.mockResolvedValue(null);
  db.waMessage.findMany.mockResolvedValue([]);
  db.waConversation.findMany.mockResolvedValue([]);
  db.waConversation.updateMany.mockResolvedValue({ count: 1 });
  db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: true });
  owners.listOwnerNumbers.mockResolvedValue([{ id: "o1", name: "Rizal", waNumber: "6289700006937" }]);
});

describe("isOwnEcho: gambar QRIS dari sistem (produksi 2026-11-12 09:07)", () => {
  const sent = ["[Gambar QRIS] https://assets.yukdesain.com/payment-logo/qris/1794145290112.jpeg"];
  it("pantulan berisi caption gambar yang dikirim sistem → pantulan sendiri", () => {
    expect(isOwnEcho("QRIS", sent)).toBe(true);
    expect(isOwnEcho("QRIS BCA", ["[Gambar QRIS BCA] https://cdn.example.com/q.png"])).toBe(true);
  });
  it("caption lain tetap dianggap ketikan admin", () => {
    expect(isOwnEcho("QRIS Mandiri", sent)).toBe(false);
  });
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

describe("handleKirimiEcho: chat aktif + notifikasi (docs/WHATSAPP_CHANNEL_KIRIMI.md §10)", () => {
  it("pantulan balasan bot/portal (dicocokkan ke semua chat) → diabaikan, tanpa chat baru", async () => {
    db.waMessage.findMany.mockResolvedValue([{ body: "Halo kak, mau desain apa?" }]);
    expect(await handleKirimiEcho(echo("Halo kak, mau desain apa?"), now)).toBe("own");
    expect(db.waMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.not.objectContaining({ conversationId: expect.anything() }) }));
    expect(db.waConversation.updateMany).not.toHaveBeenCalled();
    expect(db.waMessage.create).not.toHaveBeenCalled();
  });

  it("admin mengetik dari HP, satu chat aktif → chat itu pindah ke admin dan pesannya dicatat", async () => {
    db.waConversation.findMany.mockResolvedValue([conv("c1")]);
    expect(await handleKirimiEcho(echo("Siap kak, saya cek dulu"), now)).toBe("takeover");
    expect(db.waConversation.updateMany).toHaveBeenCalledWith({ where: { id: "c1", mode: "BOT" }, data: { mode: "HUMAN" } });
    expect(db.waMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ conversationId: "c1", wamid: "kirimi:phone:M1", direction: "OUTBOUND", body: "Siap kak, saya cek dulu", sentByBot: false }),
    });
    expect(push.notifyOwnersPush).not.toHaveBeenCalled();
  });

  it("chat aktif dicari dari pesan klien 15 menit terakhir, bukan Uji bot / nomor diblokir", async () => {
    await handleKirimiEcho(echo("Siap kak"), now);
    expect(db.waConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isSandbox: false,
          blockedAt: null,
          messages: { some: { direction: "INBOUND", createdAt: { gte: new Date("2026-11-08T04:45:00Z") } } },
        },
      }),
    );
  });

  it("chat instruksi owner tidak dihitung; owner yang tes #klien dihitung", async () => {
    db.waConversation.findMany.mockResolvedValue([conv("c1"), conv("own", { waId: "6289700006937" })]);
    expect(await handleKirimiEcho(echo("Siap kak"), now)).toBe("takeover");
    db.waConversation.findMany.mockResolvedValue([conv("c1"), conv("own", { waId: "6289700006937", ownerActsAsClient: true })]);
    expect(await handleKirimiEcho({ ...echo("Siap kak"), msgId: "M2" }, now)).toBe("ambiguous");
  });

  it("beberapa chat aktif → tidak menebak, owner diberi notifikasi berisi chat yang masih dipegang bot", async () => {
    db.waConversation.findMany.mockResolvedValue([conv("c1"), conv("c2", { mode: "HUMAN" })]);
    expect(await handleKirimiEcho(echo("Siap kak"), now)).toBe("ambiguous");
    expect(db.waConversation.updateMany).not.toHaveBeenCalled();
    expect(db.waMessage.create).not.toHaveBeenCalled();
    expect(push.notifyOwnersPush).toHaveBeenCalledWith(
      "NEEDS_ADMIN",
      expect.objectContaining({ title: "Balasan dari HP belum dicocokkan", body: expect.stringContaining("Klien c1"), url: "/wa-orders?tab=inbox" }),
    );
    expect(push.notifyOwnersPush.mock.calls[0][1].body).not.toContain("Klien c2");
  });

  it("beberapa chat aktif tapi semuanya sudah dipegang admin → bot memang diam, tanpa notifikasi", async () => {
    db.waConversation.findMany.mockResolvedValue([conv("c1", { mode: "HUMAN" }), conv("c2", { mode: "HUMAN" })]);
    expect(await handleKirimiEcho(echo("Siap kak"), now)).toBe("ambiguous_all_human");
    expect(push.notifyOwnersPush).not.toHaveBeenCalled();
  });

  it("notifikasi belum dicocokkan paling banyak satu per 15 menit", async () => {
    db.waConversation.findMany.mockResolvedValue([conv("c1"), conv("c2")]);
    await handleKirimiEcho(echo("Siap kak"), now);
    await handleKirimiEcho({ ...echo("Sebentar ya kak"), msgId: "M2" }, new Date(now.getTime() + 14 * 60_000));
    expect(push.notifyOwnersPush).toHaveBeenCalledTimes(1);
    await handleKirimiEcho({ ...echo("Sudah kak"), msgId: "M3" }, new Date(now.getTime() + 15 * 60_000));
    expect(push.notifyOwnersPush).toHaveBeenCalledTimes(2);
  });

  it("tidak ada chat aktif → hanya dicatat di log, tanpa chat baru", async () => {
    expect(await handleKirimiEcho(echo("Halo kak, revisi kemarin sudah jadi"), now)).toBe("no_active_chat");
    expect(db.waMessage.create).not.toHaveBeenCalled();
    expect(push.notifyOwnersPush).not.toHaveBeenCalled();
  });

  it("media dari HP dicatat dengan teks penanda", async () => {
    db.waConversation.findMany.mockResolvedValue([conv("c1")]);
    await handleKirimiEcho(echo(""), now);
    expect(db.waMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ body: PHONE_MEDIA_BODY }) });
  });

  // Produksi 14 Nov (Mr.K4z): foto berketerangan dari HP admin tersimpan sebagai teks biasa "red velvet", sehingga
  // riwayat chat (dan bot) membacanya seolah admin mengetik "red velvet".
  it("media berketerangan dari HP dicatat dengan penanda media + keterangannya", async () => {
    db.waConversation.findMany.mockResolvedValue([conv("c1")]);
    await handleKirimiEcho({ ...echo("red velvet"), hasMedia: true }, now);
    expect(db.waMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ body: `${PHONE_MEDIA_BODY} red velvet` }) });
  });

  it("Balas otomatis portal mati (mis. Agen AI Kirimi yang membalas) → pantulan diabaikan, tanpa mode admin / notifikasi", async () => {
    db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: false });
    db.waConversation.findMany.mockResolvedValue([conv("c1"), conv("c2")]);
    expect(await handleKirimiEcho(echo("Halo kak, ada yang bisa dibantu?"), now)).toBe("bot_off");
    expect(db.waConversation.updateMany).not.toHaveBeenCalled();
    expect(db.waMessage.create).not.toHaveBeenCalled();
    expect(push.notifyOwnersPush).not.toHaveBeenCalled();
  });

  it("kiriman ulang webhook → tidak diproses dua kali", async () => {
    db.waMessage.findUnique.mockResolvedValue({ id: "m1" });
    expect(await handleKirimiEcho(echo("Siap kak"), now)).toBe("duplicate");
    expect(db.waConversation.findMany).not.toHaveBeenCalled();
  });
});

describe("isPhoneReplyWamid", () => {
  it("hanya wamid kirimi:phone:…", () => {
    expect(isPhoneReplyWamid("kirimi:phone:M1")).toBe(true);
    expect(isPhoneReplyWamid("kirimi:yd-1")).toBe(false);
    expect(isPhoneReplyWamid(null)).toBe(false);
  });
});

// Produksi 12 Nov (Virgi, Santi, gg, hastalinuwih): sapaan otomatis WA Business ("Hai Kak, selamat datang di
// Yukdesainn!") keluar dari HP studio saat kontak baru menulis, lalu dianggap ketikan admin → chat pindah ke admin.
describe("handleKirimiEcho: sapaan otomatis WA Business bukan ketikan admin", () => {
  const greeting = "Hai Kak, selamat datang di Yukdesainn! 👋 Untuk pricelist, Kakak bisa langsung cek di katalog pada profil kami ya.";
  const at = (msAgo: number) => new Date(now.getTime() - msAgo);
  // findMany dipakai dua kali: pesan keluar terbaru (semua chat) dan pesan klien terbaru di chat ini.
  const givenChat = (inboundAgo: number[], prior: Date | null) => {
    db.waConversation.findMany.mockResolvedValue([conv("c1")]);
    db.waMessage.findMany.mockImplementation(async (args: { where: { direction?: string } }) =>
      args.where.direction === "INBOUND" ? inboundAgo.map((ms) => ({ createdAt: at(ms) })) : [],
    );
    db.waMessage.findFirst.mockResolvedValue(prior ? { createdAt: prior } : null);
  };

  it("chat baru: pesan pertama klien < 60 detik lalu, tanpa pesan sebelumnya → dicatat, chat tetap di bot", async () => {
    givenChat([9_000], null);
    expect(await handleKirimiEcho(echo(greeting), now)).toBe("auto_greeting");
    expect(db.waConversation.updateMany).not.toHaveBeenCalled();
    expect(db.waMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ conversationId: "c1", body: greeting, sentByBot: false }) });
  });

  it("kontak lama yang kembali setelah > 24 jam sepi → sapaan otomatis juga", async () => {
    givenChat([5_000], at(30 * 3_600_000));
    expect(await handleKirimiEcho(echo(greeting), now)).toBe("auto_greeting");
  });

  it("percakapan yang sedang berjalan (pesan lain < 24 jam sebelumnya) → tetap dianggap admin mengetik", async () => {
    givenChat([5_000], at(10 * 60_000));
    expect(await handleKirimiEcho(echo("Siap kak, saya cek dulu"), now)).toBe("takeover");
    expect(db.waConversation.updateMany).toHaveBeenCalledWith({ where: { id: "c1", mode: "BOT" }, data: { mode: "HUMAN" } });
  });

  // Produksi 9 Nov (Yulistian): admin membalas dari HP 8 detik setelah klien menulis lagi setelah lama sepi.
  it("balasan pendek admin di detik-detik awal chat baru → tetap dianggap admin mengetik", async () => {
    givenChat([8_000], null);
    expect(await handleKirimiEcho(echo("selamat pagi ka"), now)).toBe("takeover");
  });

  it("pesan klien terakhir > 30 detik lalu → admin mengetik", async () => {
    givenChat([], null);
    expect(await handleKirimiEcho(echo("Siap kak, saya cek dulu"), now)).toBe("takeover");
  });
});
