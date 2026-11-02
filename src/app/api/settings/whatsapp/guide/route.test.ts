import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ activityLog: { create: vi.fn() } }));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const guide = vi.hoisted(() => ({
  getDraftGuide: vi.fn(),
  getPublishedGuide: vi.fn(),
  listGuideVersions: vi.fn(),
  saveDraftGuide: vi.fn(),
  publishDraftGuide: vi.fn(),
  restoreGuideVersion: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/whatsapp/ai/bot-guide", async (orig) => ({ ...(await orig<typeof import("@/lib/whatsapp/ai/bot-guide")>()), ...guide }));

import { GuideConflictError } from "@/lib/whatsapp/ai/bot-guide";
import { GET, PUT } from "./route";
import { POST as publish } from "./publish/route";
import { POST as restore } from "./restore/route";

const owner = { id: "u_owner", roles: ["OWNER"] };
const json = (url: string, method: string, body: unknown) =>
  new Request(`http://x${url}`, { method, body: JSON.stringify(body) });
const current = { instructions: "Admin membalas jam 09.00-17.00.", faqs: [] };

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue(owner);
  guide.getDraftGuide.mockResolvedValue(current);
  guide.getPublishedGuide.mockResolvedValue({ version: 2, publishedAt: new Date("2026-11-01"), guide: current });
  guide.listGuideVersions.mockResolvedValue([]);
});

describe("akses", () => {
  it("tanpa login → 401, bukan owner → 403, untuk semua route", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await GET()).status).toBe(403);
    expect((await PUT(json("/g", "PUT", current))).status).toBe(403);
    expect((await publish()).status).toBe(403);
    expect((await restore(json("/g/restore", "POST", { version: 1 }))).status).toBe(403);
    expect(guide.saveDraftGuide).not.toHaveBeenCalled();
    expect(guide.publishDraftGuide).not.toHaveBeenCalled();
  });
});

describe("GET", () => {
  it("draft sama dengan versi aktif → tidak ada perubahan", async () => {
    const body = await (await GET()).json();
    expect(body).toMatchObject({ draft: current, published: { version: 2 }, hasUnpublishedChanges: false });
    expect(body.limits.faqMaxItems).toBe(30);
  });

  it("belum pernah terbit dan draft kosong → tidak dianggap perubahan", async () => {
    guide.getPublishedGuide.mockResolvedValue(null);
    guide.getDraftGuide.mockResolvedValue({ instructions: "", faqs: [] });
    const body = await (await GET()).json();
    expect(body).toMatchObject({ published: null, hasUnpublishedChanges: false });
  });
});

describe("PUT (simpan draft)", () => {
  it("valid → disimpan sudah dirapikan, versi aktif tidak berubah", async () => {
    const res = await PUT(json("/g", "PUT", { instructions: "  baru  ", faqs: [] }));
    expect(res.status).toBe(200);
    expect(guide.saveDraftGuide).toHaveBeenCalledWith({ instructions: "baru", faqs: [] });
    expect(guide.publishDraftGuide).not.toHaveBeenCalled();
  });

  it("tidak valid → 400 dengan field yang salah", async () => {
    const res = await PUT(json("/g", "PUT", { instructions: "", faqs: [{ question: "", answer: "x" }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).fields).toHaveProperty("faqs.0.question");
    expect(guide.saveDraftGuide).not.toHaveBeenCalled();
  });
});

describe("POST publish", () => {
  it("terbit → versi baru dan activity log", async () => {
    guide.publishDraftGuide.mockResolvedValue({ version: 3, publishedAt: new Date(), guide: current });
    const res = await publish();
    expect(res.status).toBe(200);
    expect(guide.publishDraftGuide).toHaveBeenCalledWith("u_owner");
    expect(db.activityLog.create.mock.calls[0][0].data).toMatchObject({
      action: "WA_BOT_GUIDE_PUBLISHED",
      actorId: "u_owner",
      newValue: { version: 3 },
    });
  });

  it("draft sama / bentrok → 409 tanpa activity log", async () => {
    guide.publishDraftGuide.mockRejectedValue(new GuideConflictError("Draft sama dengan versi yang sedang aktif"));
    const res = await publish();
    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain("Draft sama");
    expect(db.activityLog.create).not.toHaveBeenCalled();
  });
});

describe("POST restore", () => {
  it("versi ada → disalin ke draft", async () => {
    guide.restoreGuideVersion.mockResolvedValue(current);
    expect((await restore(json("/g/restore", "POST", { version: 1 }))).status).toBe(200);
    expect(guide.restoreGuideVersion).toHaveBeenCalledWith(1);
  });

  it("versi tidak ada → 404; input salah → 400", async () => {
    guide.restoreGuideVersion.mockResolvedValue(null);
    expect((await restore(json("/g/restore", "POST", { version: 9 }))).status).toBe(404);
    expect((await restore(json("/g/restore", "POST", { version: "1" }))).status).toBe(400);
  });
});
