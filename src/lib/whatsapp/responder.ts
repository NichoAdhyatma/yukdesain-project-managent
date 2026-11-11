import { prisma } from "@/lib/db";
import { getDraftGuide, getPublishedGuide, sameGuide } from "./ai/bot-guide";
import { getChannel, type WaChannel } from "./channel";
import { isKirimiConfigured } from "./env";
import { logConversationActivity } from "./inbox";
import { kirimiDeviceStatus } from "./kirimi";
import { maskPhone } from "./phone";

// Ganti penjawab chat klien: bot portal (Balas otomatis) atau Agen AI Kirimi (docs/WHATSAPP_CHANNEL_KIRIMI.md
// "Ganti penjawab"). Keduanya tidak boleh menyala bersamaan: klien menerima dua balasan dan balasan AI Kirimi
// terbaca sebagai ketikan admin. API Kirimi tidak bisa menyalakan/mematikan AI-nya; portal hanya membaca status.

export type KirimiAiState = "off" | "on" | "unknown" | "not_kirimi";
export type Responder = "PORTAL" | "KIRIMI";

export type HumanChat = {
  id: string;
  name: string | null;
  phone: string;
  lastInboundAt: Date | null;
  preview: string | null;
  /** Semua balasan admin di chat ini datang dari HP (pantulan Kirimi), tidak ada yang diketik di portal */
  onlyPhoneReplies: boolean;
};

const PHONE_REPLY_PREFIX = "kirimi:phone:";
const PREVIEW_MAX = 80;

async function kirimiAiState(channel: WaChannel): Promise<KirimiAiState> {
  if (channel !== "KIRIMI" || !isKirimiConfigured()) return "not_kirimi";
  try {
    return (await kirimiDeviceStatus()).aiEnabled ? "on" : "off";
  } catch {
    return "unknown";
  }
}

async function listHumanChats(): Promise<HumanChat[]> {
  const rows = await prisma.waConversation.findMany({
    where: { mode: "HUMAN", isSandbox: false, blockedAt: null },
    orderBy: { lastInboundAt: "desc" },
    select: {
      id: true,
      waId: true,
      profileName: true,
      lastInboundAt: true,
      client: { select: { name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, direction: true, createdAt: true } },
    },
  });
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [phoneReplies, portalReplies] = await Promise.all([
    prisma.waMessage.groupBy({
      by: ["conversationId"],
      where: { conversationId: { in: ids }, direction: "OUTBOUND", wamid: { startsWith: PHONE_REPLY_PREFIX } },
      _count: { _all: true },
    }),
    prisma.waMessage.groupBy({
      by: ["conversationId"],
      where: { conversationId: { in: ids }, direction: "OUTBOUND", sentById: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const fromPhone = new Set(phoneReplies.map((r) => r.conversationId));
  const fromPortal = new Set(portalReplies.map((r) => r.conversationId));
  return rows.map((r) => {
    const last = r.messages[0];
    const body = last?.body?.trim() ?? "";
    return {
      id: r.id,
      name: r.client?.name ?? r.profileName ?? null,
      phone: maskPhone(r.waId),
      lastInboundAt: r.lastInboundAt,
      preview: body ? (body.length > PREVIEW_MAX ? `${body.slice(0, PREVIEW_MAX - 1)}…` : body) : null,
      onlyPhoneReplies: fromPhone.has(r.id) && !fromPortal.has(r.id),
    };
  });
}

export async function getResponderStatus() {
  const channel = await getChannel();
  const [settings, kirimiAi, published, draft, humanChats] = await Promise.all([
    prisma.studioSettings.findUnique({ where: { id: "default" }, select: { waBotEnabled: true } }),
    kirimiAiState(channel),
    getPublishedGuide(),
    getDraftGuide(),
    listHumanChats(),
  ]);
  return {
    botEnabled: settings?.waBotEnabled ?? false,
    channel,
    kirimiAi,
    publishedVersion: published?.version ?? null,
    draftDiffers: published ? !sameGuide(draft, published.guide) : true,
    humanChats,
  };
}

export type SwitchInput =
  | { to: "PORTAL"; returnConversationIds: string[]; kirimiOffConfirmed?: boolean }
  | { to: "KIRIMI" };

export type SwitchResult =
  | { ok: true; botEnabled: boolean; returned: number }
  | { ok: false; error: "KIRIMI_AI_ON" | "KIRIMI_UNCONFIRMED" };

export async function switchResponder(input: SwitchInput, actorId: string): Promise<SwitchResult> {
  const before = await prisma.studioSettings.findUnique({ where: { id: "default" }, select: { waBotEnabled: true } });

  if (input.to === "KIRIMI") {
    await prisma.$transaction(async (tx) => {
      await tx.studioSettings.update({ where: { id: "default" }, data: { waBotEnabled: false } });
      await tx.activityLog.create({
        data: {
          entityType: "StudioSettings",
          entityId: "default",
          action: "WA_RESPONDER_SWITCHED",
          actorId,
          previousValue: { botEnabled: before?.waBotEnabled ?? false },
          newValue: { responder: "KIRIMI", botEnabled: false },
        },
      });
    });
    return { ok: true, botEnabled: false, returned: 0 };
  }

  // Dicek ulang di server: status di layar bisa sudah basi.
  const ai = await kirimiAiState(await getChannel());
  // ai_enabled dari Kirimi tidak selalu ikut berubah setelah Agen AI dimatikan di dashboard (temuan 2026-11-11),
  // jadi laporan "aktif" bisa dilewati dengan konfirmasi owner; konfirmasinya ikut dicatat.
  if (ai === "on" && !input.kirimiOffConfirmed) return { ok: false, error: "KIRIMI_AI_ON" };
  if (ai === "unknown" && !input.kirimiOffConfirmed) return { ok: false, error: "KIRIMI_UNCONFIRMED" };

  const ids = [...new Set(input.returnConversationIds)];
  const returned = await prisma.$transaction(async (tx) => {
    let count = 0;
    if (ids.length) {
      const where = { id: { in: ids }, mode: "HUMAN" as const, isSandbox: false };
      const targets = (await tx.waConversation.findMany({ where, select: { id: true } })) ?? [];
      count = (await tx.waConversation.updateMany({ where, data: { mode: "BOT" } })).count;
      for (const t of targets) {
        await logConversationActivity(tx, {
          conversationId: t.id,
          actorId,
          action: "WA_CHAT_RETURNED_TO_BOT",
          previousValue: { mode: "HUMAN" },
          newValue: { mode: "BOT", via: "responder_switch" },
        });
      }
    }
    await tx.studioSettings.update({ where: { id: "default" }, data: { waBotEnabled: true } });
    await tx.activityLog.create({
      data: {
        entityType: "StudioSettings",
        entityId: "default",
        action: "WA_RESPONDER_SWITCHED",
        actorId,
        previousValue: { botEnabled: before?.waBotEnabled ?? false },
        newValue: { responder: "PORTAL", botEnabled: true, returnedChats: count, kirimiAi: ai, kirimiOffConfirmed: !!input.kirimiOffConfirmed },
      },
    });
    return count;
  });
  return { ok: true, botEnabled: true, returned };
}
