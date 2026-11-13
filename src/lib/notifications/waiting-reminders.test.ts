import { beforeEach, describe, expect, it, vi } from "vitest";

// Pengingat "menunggu admin" (docs/OWNER_NOTIFICATIONS_INBOX.md §2a). Produksi 13 Nov: 4 chat mode admin menunggu
// 1–2 jam ("chatnya ketimbun"), pertanyaan bot ke owner menunggu berjam-jam, DP Mif diterima lewat HP tanpa invoice portal.
const db = vi.hoisted(() => ({
  waConversation: { findMany: vi.fn() },
  waOwnerQuery: { findMany: vi.fn() },
  waMessage: { count: vi.fn(), findMany: vi.fn() },
  paymentAccount: { findMany: vi.fn() },
  waIntake: { findFirst: vi.fn(), count: vi.fn() },
  project: { count: vi.fn() },
  adminWaitReminder: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
}));
const push = vi.hoisted(() => ({ notifyOwnersPush: vi.fn() }));
const owners = vi.hoisted(() => ({ listOwnerNumbers: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("./push", () => push);
vi.mock("@/lib/whatsapp/owner/identity", () => owners);

import {
  buildReminderPush,
  isReminderDue,
  mentionsPaymentDetails,
  sendWaitingReminders,
  unansweredSince,
  type WaitingItem,
} from "./waiting-reminders";

const now = new Date("2026-11-13T05:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const msg = (id: string, direction: "INBOUND" | "OUTBOUND", minutes: number, body = "Halo kak, gimana progresnya?") => ({
  id,
  direction,
  type: "text",
  body,
  createdAt: minutesAgo(minutes),
});

beforeEach(() => {
  vi.resetAllMocks();
  owners.listOwnerNumbers.mockResolvedValue([{ id: "o1", name: "Rizal", waNumber: "6281200003433" }]);
  db.waConversation.findMany.mockResolvedValue([]);
  db.waOwnerQuery.findMany.mockResolvedValue([]);
  db.waMessage.count.mockResolvedValue(0);
  db.waMessage.findMany.mockResolvedValue([]);
  db.paymentAccount.findMany.mockResolvedValue([{ accountNumber: "2141358555" }]);
  db.waIntake.findFirst.mockResolvedValue(null);
  db.waIntake.count.mockResolvedValue(0);
  db.project.count.mockResolvedValue(0);
  db.adminWaitReminder.findMany.mockResolvedValue([]);
  db.adminWaitReminder.deleteMany.mockResolvedValue({ count: 0 });
  push.notifyOwnersPush.mockResolvedValue(1);
});

describe("unansweredSince", () => {
  it("pesan terakhir dari admin/bot → tidak menunggu", () => {
    expect(unansweredSince([msg("m2", "OUTBOUND", 5), msg("m1", "INBOUND", 10)])).toBeNull();
  });

  it("beberapa pesan klien setelah balasan terakhir → menunggu sejak pesan klien pertama", () => {
    const since = unansweredSince([msg("m3", "INBOUND", 20), msg("m2", "INBOUND", 50), msg("m1", "OUTBOUND", 60)]);
    expect(since).toEqual({ id: "m2", createdAt: minutesAgo(50) });
  });

  it("hanya basa-basi (\"Baik kak\", \"ok, ditunggu\") → tidak perlu dibalas", () => {
    expect(unansweredSince([msg("m2", "INBOUND", 40, "Baik kak"), msg("m1", "OUTBOUND", 45)])).toBeNull();
  });

  it("basa-basi setelah pertanyaan → tetap menunggu sejak pertanyaan", () => {
    const since = unansweredSince([
      msg("m3", "INBOUND", 30, "ok kak"),
      msg("m2", "INBOUND", 90, "Klo tambahan per 1 image nya berapa?"),
      msg("m1", "OUTBOUND", 95),
    ]);
    expect(since).toEqual({ id: "m2", createdAt: minutesAgo(90) });
  });

  // Produksi 13 Nov (Mirnasuhera): "Baik dtunggu kak" lalu "Kak ?" dua jam kemudian → menunggu sejak "Kak ?".
  it("basa-basi sebelum pertanyaan → menunggu sejak pesan pertama yang bukan basa-basi", () => {
    const since = unansweredSince([
      msg("m3", "INBOUND", 60, "Kak ?"),
      msg("m2", "INBOUND", 180, "Baik dtunggu kak ☺️"),
      msg("m1", "OUTBOUND", 181),
    ]);
    expect(since).toEqual({ id: "m3", createdAt: minutesAgo(60) });
  });

  it("gambar dari klien dihitung menunggu", () => {
    expect(unansweredSince([{ ...msg("m2", "INBOUND", 40, ""), type: "image" }, msg("m1", "OUTBOUND", 45)])).toEqual({
      id: "m2",
      createdAt: minutesAgo(40),
    });
  });
});

describe("mentionsPaymentDetails", () => {
  const accounts = ["2141358555", "1400021357364"];

  it.each([
    ["2141358555 \n(BCA) Mochammad Rizal\n\natau\n\n1400021357364 (MANDIRI)", true],
    ["rek 2141-358-555 ya kak", true],
    ["baik ka, pembayaran dp kami terima ya", true],
    ["DP sudah kami terima kak", true],
    ["baik, untuk totalnya 135rb ya ka", false],
    ["untuk cek sketsa boleh di file ini ya ka", false],
  ])("%j → %s", (text, expected) => {
    expect(mentionsPaymentDetails(text, accounts)).toBe(expected);
  });
});

describe("isReminderDue", () => {
  const since = (m: number) => minutesAgo(m);

  it.each([
    [29, undefined, false],
    [30, undefined, true],
    [60, { count: 1, lastSentAt: minutesAgo(30) }, false],
    [120, { count: 1, lastSentAt: minutesAgo(90) }, true],
    [130, { count: 1, lastSentAt: minutesAgo(10) }, false],
    [600, { count: 2, lastSentAt: minutesAgo(300) }, false],
  ])("menunggu %i menit, catatan %j → %s", (waited, record, expected) => {
    expect(isReminderDue(since(waited), record, now)).toBe(expected);
  });
});

describe("buildReminderPush", () => {
  const item = (key: string, kind: WaitingItem["kind"], name: string, m: number): WaitingItem => ({
    key,
    kind,
    conversationId: `c_${key}`,
    name,
    waId: "6289900001234",
    since: minutesAgo(m),
  });

  it("judul jumlah; isi urut dari yang paling lama, nomor tersamar, lama menunggu", () => {
    const { title, body, url } = buildReminderPush(
      [item("a", "chat", "Knn", 45), item("b", "query", "Coffee Duri", 210), item("c", "dp_phone", "Mif", 120)],
      now,
    );
    expect(title).toBe("3 hal menunggu admin");
    expect(body.split("\n")).toEqual([
      "Coffee Duri (6289****1234) · pertanyaan bot belum dijawab · 3 jam 30 mnt",
      "Mif (6289****1234) · DP lewat HP belum dicatat di portal · 2 jam",
      "Knn (6289****1234) · chat belum dibalas · 45 mnt",
    ]);
    expect(body).not.toContain("6289900001234");
    expect(url).toBe("/wa-orders?tab=inbox");
  });

  it("lebih dari 4 → 4 baris + sisanya", () => {
    const items = ["a", "b", "c", "d", "e", "f"].map((k, i) => item(k, "chat", `K${i}`, 40 + i));
    const { body } = buildReminderPush(items, now);
    expect(body.split("\n")).toHaveLength(5);
    expect(body.split("\n")[4]).toBe("dan 2 lainnya");
  });

  it("satu chat → tautan langsung ke chat itu", () => {
    expect(buildReminderPush([item("a", "chat", "Knn", 45)], now).url).toBe("/wa-orders?tab=inbox&chat=c_a");
  });
});

describe("sendWaitingReminders", () => {
  const humanChat = (id: string, waId: string, messages: ReturnType<typeof msg>[]) => ({ id, waId, profileName: `Klien ${id}`, messages });

  it("chat mode admin belum dibalas 45 menit → satu push, dicatat sekali", async () => {
    db.waConversation.findMany.mockResolvedValue([humanChat("c1", "6289900001111", [msg("m2", "INBOUND", 45), msg("m1", "OUTBOUND", 60)])]);
    expect(await sendWaitingReminders(now)).toEqual({ waiting: 1, reminded: 1 });
    expect(push.notifyOwnersPush).toHaveBeenCalledTimes(1);
    expect(push.notifyOwnersPush.mock.calls[0][0]).toBe("WAITING_REMINDER");
    expect(push.notifyOwnersPush.mock.calls[0][1]).toMatchObject({ title: "1 hal menunggu admin", tag: "waiting-reminder" });
    expect(db.adminWaitReminder.upsert).toHaveBeenCalledWith({
      where: { key: "chat:m2" },
      create: { key: "chat:m2", count: 1, lastSentAt: now },
      update: { count: { increment: 1 }, lastSentAt: now },
    });
  });

  it("yang filter percakapannya: hanya mode admin, bukan uji bot, bukan nomor diblokir", async () => {
    await sendWaitingReminders(now);
    expect(db.waConversation.findMany.mock.calls[0][0].where).toMatchObject({ mode: "HUMAN", isSandbox: false, blockedAt: null });
  });

  it("baru 10 menit → belum diingatkan", async () => {
    db.waConversation.findMany.mockResolvedValue([humanChat("c1", "6289900001111", [msg("m2", "INBOUND", 10)])]);
    expect(await sendWaitingReminders(now)).toEqual({ waiting: 0, reminded: 0 });
    expect(push.notifyOwnersPush).not.toHaveBeenCalled();
  });

  it("sudah diingatkan sekali 20 menit lalu → tidak dikirim lagi sekarang", async () => {
    db.waConversation.findMany.mockResolvedValue([humanChat("c1", "6289900001111", [msg("m2", "INBOUND", 50)])]);
    db.adminWaitReminder.findMany.mockResolvedValue([{ key: "chat:m2", count: 1, lastSentAt: minutesAgo(20) }]);
    expect(await sendWaitingReminders(now)).toEqual({ waiting: 1, reminded: 0 });
    expect(push.notifyOwnersPush).not.toHaveBeenCalled();
  });

  it("sudah 2 kali diingatkan → tidak disebut lagi", async () => {
    db.waConversation.findMany.mockResolvedValue([humanChat("c1", "6289900001111", [msg("m2", "INBOUND", 400)])]);
    db.adminWaitReminder.findMany.mockResolvedValue([{ key: "chat:m2", count: 2, lastSentAt: minutesAgo(200) }]);
    expect(await sendWaitingReminders(now)).toEqual({ waiting: 0, reminded: 0 });
    expect(push.notifyOwnersPush).not.toHaveBeenCalled();
  });

  it("chat nomor owner sendiri tidak dihitung", async () => {
    db.waConversation.findMany.mockResolvedValue([humanChat("c1", "6281200003433", [msg("m2", "INBOUND", 45)])]);
    expect(await sendWaitingReminders(now)).toEqual({ waiting: 0, reminded: 0 });
  });

  it("pertanyaan bot ke owner yang belum dijawab 40 menit → diingatkan", async () => {
    db.waOwnerQuery.findMany.mockResolvedValue([
      { id: "q1", createdAt: minutesAgo(40), conversationId: "c9", conversation: { waId: "6281300002256", profileName: "Coffee Duri" } },
    ]);
    expect(await sendWaitingReminders(now)).toEqual({ waiting: 1, reminded: 1 });
    expect(push.notifyOwnersPush.mock.calls[0][1].body).toContain("Coffee Duri (6281****2256) · pertanyaan bot belum dijawab");
    expect(db.waOwnerQuery.findMany.mock.calls[0][0].where).toMatchObject({ status: "PENDING", expiresAt: { gt: now } });
  });

  it("pertanyaan yang klien-nya sudah dibalas admin langsung → dianggap ditangani", async () => {
    db.waOwnerQuery.findMany.mockResolvedValue([
      { id: "q1", createdAt: minutesAgo(300), conversationId: "c9", conversation: { waId: "6281300002256", profileName: "Day" } },
    ]);
    db.waMessage.count.mockResolvedValue(3);
    expect(await sendWaitingReminders(now)).toEqual({ waiting: 0, reminded: 0 });
    expect(db.waMessage.count.mock.calls[0][0].where).toMatchObject({
      conversationId: "c9",
      direction: "OUTBOUND",
      createdAt: { gt: minutesAgo(300) },
    });
  });

  // Produksi 13 Nov (Day): pertanyaan kemarin masih PENDING padahal order sudah diberi harga dan DP disetujui.
  it("pertanyaan yang order-nya sudah diberi harga sesudahnya → dianggap ditangani", async () => {
    db.waOwnerQuery.findMany.mockResolvedValue([
      { id: "q1", createdAt: minutesAgo(1300), conversationId: "c9", conversation: { waId: "6285500008867", profileName: "Day" } },
    ]);
    db.waIntake.count.mockResolvedValue(1);
    expect(await sendWaitingReminders(now)).toEqual({ waiting: 0, reminded: 0 });
    expect(db.waIntake.count.mock.calls[0][0].where).toEqual({ conversationId: "c9", quotedAt: { gt: minutesAgo(1300) } });
  });

  it("rekening/DP lewat HP tanpa invoice portal → diingatkan (kasus Mif)", async () => {
    db.waMessage.findMany.mockResolvedValue([
      { id: "e1", body: "baik, untuk totalnya 135rb ya ka", createdAt: minutesAgo(95), conversationId: "c5", conversation: { waId: "6285700002367", profileName: "Mif", clientId: null } },
      { id: "e2", body: "2141358555\n(BCA) Mochammad Rizal", createdAt: minutesAgo(94), conversationId: "c5", conversation: { waId: "6285700002367", profileName: "Mif", clientId: null } },
      { id: "e3", body: "baik ka, pembayaran dp kami terima ya", createdAt: minutesAgo(90), conversationId: "c5", conversation: { waId: "6285700002367", profileName: "Mif", clientId: null } },
    ]);
    expect(await sendWaitingReminders(now)).toEqual({ waiting: 1, reminded: 1 });
    expect(push.notifyOwnersPush.mock.calls[0][1].body).toBe("Mif (6285****2367) · DP lewat HP belum dicatat di portal · 1 jam 34 mnt");
    expect(db.adminWaitReminder.upsert.mock.calls[0][0].where).toEqual({ key: "dp:e2" });
    expect(db.waMessage.findMany.mock.calls[0][0].where).toMatchObject({ direction: "OUTBOUND", wamid: { startsWith: "kirimi:phone:" } });
  });

  it("rekening lewat HP tapi invoice portal sudah ada (YAHDI) → tidak diingatkan", async () => {
    db.waMessage.findMany.mockResolvedValue([
      { id: "e1", body: "2141358555 (BCA)", createdAt: minutesAgo(60), conversationId: "c6", conversation: { waId: "6281100004321", profileName: "Robi", clientId: null } },
    ]);
    db.waIntake.findFirst.mockResolvedValue({ id: "i1" });
    expect(await sendWaitingReminders(now)).toEqual({ waiting: 0, reminded: 0 });
  });

  it("rekening lewat HP untuk klien yang project-nya baru dibuat (pelunasan) → tidak diingatkan", async () => {
    db.waMessage.findMany.mockResolvedValue([
      { id: "e1", body: "2141358555 (BCA)", createdAt: minutesAgo(60), conversationId: "c6", conversation: { waId: "6281100004321", profileName: "Robi", clientId: "cl1" } },
    ]);
    db.project.count.mockResolvedValue(1);
    expect(await sendWaitingReminders(now)).toEqual({ waiting: 0, reminded: 0 });
  });

  it("catatan pengingat lebih dari 3 hari dibersihkan", async () => {
    await sendWaitingReminders(now);
    expect(db.adminWaitReminder.deleteMany).toHaveBeenCalledWith({ where: { lastSentAt: { lt: new Date(now.getTime() - 3 * 24 * 3_600_000) } } });
  });
});
