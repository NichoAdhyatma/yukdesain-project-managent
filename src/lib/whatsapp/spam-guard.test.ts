import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  studioSettings: { findUnique: vi.fn(), updateMany: vi.fn() },
  waMessage: { count: vi.fn(), create: vi.fn() },
  waConversation: { findUnique: vi.fn() },
}));
const channel = vi.hoisted(() => ({
  getChannel: vi.fn(),
  isChannelConfigured: vi.fn(),
  sendTextOnChannel: vi.fn(),
  usesServiceWindow: vi.fn(),
  deliveryErrorCode: vi.fn(() => "X"),
}));
const owners = vi.hoisted(() => ({ listOwnerNumbers: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("./channel", () => channel);
vi.mock("./owner/identity", () => owners);

import { getMonthlyBrake, isSmallTalk, notifyOwnersBrakeOnce, trimForAi } from "./spam-guard";

describe("isSmallTalk", () => {
  it.each(["ok", "Oke kak", "okeee", "siapp", "makasih kak 🙏", "terima kasih banyak", "thanks", "👍", "🙏🙏", "ok sip!", "iya kak makasih ya"])(
    "basa-basi: %s",
    (text) => expect(isSmallTalk(text)).toBe(true),
  );
  it.each(["ok, kapan jadinya?", "makasih, tapi warnanya ganti merah", "halo", "mau order lagi", "", "ok ".repeat(10), "berapa lama?"])(
    "bukan basa-basi: %j",
    (text) => expect(isSmallTalk(text)).toBe(false),
  );
});

describe("trimForAi", () => {
  it("teks pendek tidak diubah", () => expect(trimForAi("halo kak")).toBe("halo kak"));
  it("teks panjang dipotong dengan catatan", () => {
    const out = trimForAi("a".repeat(5000), 2000);
    expect(out.startsWith("a".repeat(2000) + "\n[Pesan klien dipotong")).toBe(true);
    expect(out).toContain("5.000 karakter");
    expect(out.length).toBeLessThan(2300);
  });
});

describe("rem bulanan", () => {
  const now = new Date("2026-11-07T05:00:00Z");
  beforeEach(() => {
    vi.clearAllMocks();
    db.studioSettings.findUnique.mockResolvedValue({ waBotMonthlyReplyCap: 2000 });
  });

  it("aktif tepat di batas; hanya balasan bot ke klien sungguhan yang dihitung", async () => {
    db.waMessage.count.mockResolvedValue(2000);
    expect(await getMonthlyBrake(now)).toEqual({ cap: 2000, used: 2000, active: true, month: "2026-11" });
    expect(db.waMessage.count.mock.calls[0][0].where).toMatchObject({
      direction: "OUTBOUND",
      sentByBot: true,
      conversation: { isSandbox: false },
    });
    db.waMessage.count.mockResolvedValue(1999);
    expect((await getMonthlyBrake(now)).active).toBe(false);
  });

  it("owner diberi tahu sekali per bulan; dalam jendela 24 jam saja di Meta", async () => {
    channel.getChannel.mockResolvedValue("META");
    channel.isChannelConfigured.mockReturnValue(true);
    channel.usesServiceWindow.mockReturnValue(true);
    channel.sendTextOnChannel.mockResolvedValue("wamid.X");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    owners.listOwnerNumbers.mockResolvedValue([
      { id: "o1", name: "Rizal", waNumber: "6281200000001" },
      { id: "o2", name: "Nico", waNumber: "6281200000002" },
    ]);
    db.waConversation.findUnique
      .mockResolvedValueOnce({ id: "c1", lastInboundAt: new Date() })
      .mockResolvedValueOnce({ id: "c2", lastInboundAt: new Date("2026-10-01") });
    db.studioSettings.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const brake = { cap: 2000, used: 2000, active: true, month: "2026-11" };
    await notifyOwnersBrakeOnce(brake);
    expect(channel.sendTextOnChannel).toHaveBeenCalledTimes(1);
    expect(channel.sendTextOnChannel.mock.calls[0][0]).toBe("6281200000001");

    await notifyOwnersBrakeOnce(brake);
    expect(channel.sendTextOnChannel).toHaveBeenCalledTimes(1);
  });
});
