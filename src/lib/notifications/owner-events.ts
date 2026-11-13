import { prisma } from "@/lib/db";
import { listOwnerNumbers } from "@/lib/whatsapp/owner/identity";
import { maskPhone } from "@/lib/whatsapp/phone";
import { notifyOwnersPush, type NotifyEvent } from "./push";

// Kejadian Order WA → notifikasi owner (docs/OWNER_NOTIFICATIONS_INBOX.md §2). Isi notifikasi tanpa nomor lengkap
// dan tanpa isi bukti transfer. Tidak dikirim untuk Uji bot, nomor yang diblokir, dan nomor owner yang sedang memberi
// instruksi. Owner yang tes sebagai klien (#klien) tetap menerima notifikasi, berjudul "[Tes] …", supaya bisa
// memastikan notifikasi masuk tanpa nomor kedua.

export type HandoffReason =
  | "client_asked"
  | "ai_failed"
  | "daily_limit"
  | "monthly_brake"
  | "owner_timeout"
  | "proof_limit"
  | "bot_handoff"
  | "image_limit";

const HANDOFF_TEXT: Record<HandoffReason, string> = {
  client_asked: "klien minta admin",
  ai_failed: "AI gagal membalas",
  daily_limit: "batas harian bot tercapai",
  monthly_brake: "rem bulanan aktif",
  owner_timeout: "pertanyaan ke owner tidak dijawab",
  proof_limit: "bukti transfer terlalu banyak",
  bot_handoff: "bot mengalihkan ke admin",
  image_limit: "gambar klien melewati batas",
};

type ConversationInfo = {
  id: string;
  waId: string;
  profileName: string | null;
  isSandbox: boolean;
  blockedAt: Date | null;
  ownerActsAsClient: boolean;
};

/** Percakapan yang boleh memicu notifikasi; `test` = owner sedang tes sebagai klien. */
async function eligibleConversation(conversationId: string): Promise<{ conversation: ConversationInfo; test: boolean } | null> {
  const conversation = await prisma.waConversation.findUnique({
    where: { id: conversationId },
    select: { id: true, waId: true, profileName: true, isSandbox: true, blockedAt: true, ownerActsAsClient: true },
  });
  if (!conversation || conversation.isSandbox || conversation.blockedAt) return null;
  const isOwner = (await listOwnerNumbers()).some((o) => o.waNumber === conversation.waId);
  if (isOwner && !conversation.ownerActsAsClient) return null;
  return { conversation, test: isOwner };
}

async function latestIntake(conversationId: string) {
  return prisma.waIntake.findFirst({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, clientName: true, service: { select: { name: true } } },
  });
}

const who = (c: ConversationInfo, clientName?: string | null) => `${clientName ?? c.profileName ?? "Klien"} (${maskPhone(c.waId)})`;

async function send(event: NotifyEvent, conversationId: string, build: (c: ConversationInfo, intake: Awaited<ReturnType<typeof latestIntake>>) => { title: string; body: string }) {
  try {
    const eligible = await eligibleConversation(conversationId);
    if (!eligible) return;
    const { conversation, test } = eligible;
    const intake = await latestIntake(conversationId);
    const built = build(conversation, intake);
    const title = test ? `[Tes] ${built.title}` : built.title;
    const { body } = built;
    const url = intake ? `/wa-orders/${intake.id}` : `/wa-orders?tab=inbox&chat=${conversation.id}`;
    await notifyOwnersPush(event, { title, body, url, tag: `${event}:${conversationId}` });
  } catch (error) {
    console.error(`[push] kejadian ${event} gagal:`, (error as Error).name);
  }
}

const serviceOf = (intake: Awaited<ReturnType<typeof latestIntake>>) => (intake?.service?.name ? ` · ${intake.service.name}` : "");

export const notifyNeedsQuote = (conversationId: string) =>
  send("NEEDS_QUOTE", conversationId, (c, intake) => ({
    title: "Perlu harga",
    body: `${who(c, intake?.clientName)}${serviceOf(intake)}`,
  }));

export const notifyDpProof = (conversationId: string) =>
  send("DP_PROOF", conversationId, (c, intake) => ({
    title: "Bukti DP masuk",
    body: `${who(c, intake?.clientName)}${serviceOf(intake)}`,
  }));

export const notifyNewClient = (conversationId: string) =>
  send("NEW_CLIENT", conversationId, (c) => ({ title: "Klien baru chat", body: who(c) }));

export const notifyNeedsAdmin = (conversationId: string, reason: HandoffReason) =>
  send("NEEDS_ADMIN", conversationId, (c, intake) => ({
    title: "Chat menunggu admin",
    body: `${who(c, intake?.clientName)} · ${HANDOFF_TEXT[reason]}`,
  }));
