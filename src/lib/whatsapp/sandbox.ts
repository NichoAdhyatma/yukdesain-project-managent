import { prisma } from "@/lib/db";
import { briefResponsesToEntries } from "@/lib/brief/responses";
import { handleInboundMessage } from "./bot";

// Uji bot dari Settings (docs/WHATSAPP_BOT_GUIDE.md §5): percakapan sungguhan di DB dengan
// isSandbox = true, memakai draft panduan, tanpa pengiriman WhatsApp. Satu percakapan per owner.

export const SANDBOX_MESSAGE_MAX_CHARS = 2000;
const TRANSCRIPT_LIMIT = 100;

/** Bukan angka, jadi tidak pernah cocok dengan nomor klien maupun wa_id dari webhook. */
export function sandboxWaId(userId: string): string {
  return `sandbox:${userId}`;
}

export async function getSandboxState(userId: string) {
  const conversation = await prisma.waConversation.findUnique({
    where: { waId: sandboxWaId(userId) },
    select: {
      id: true,
      isSandbox: true,
      mode: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: TRANSCRIPT_LIMIT,
        select: { id: true, direction: true, body: true, createdAt: true },
      },
      intakes: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          status: true,
          clientName: true,
          briefDraft: true,
          service: { select: { code: true, name: true } },
        },
      },
    },
  });
  // Penjagaan: waId sandbox:* hanya pernah dibuat oleh modul ini.
  if (!conversation?.isSandbox) return { mode: null, messages: [], intake: null };

  const intake = conversation.intakes[0];
  return {
    mode: conversation.mode,
    messages: [...conversation.messages].reverse(),
    intake: intake
      ? {
          status: intake.status,
          service: intake.service,
          clientName: intake.clientName,
          briefResponses: briefResponsesToEntries((intake.briefDraft ?? {}) as Record<string, unknown>),
        }
      : null,
  };
}

/** Simpan pesan owner sebagai pesan klien, lalu jalankan bot persis seperti pesan WhatsApp. */
export async function sendSandboxMessage(userId: string, text: string) {
  const now = new Date();
  const conversation = await prisma.waConversation.upsert({
    where: { waId: sandboxWaId(userId) },
    update: { lastInboundAt: now },
    create: { waId: sandboxWaId(userId), isSandbox: true, profileName: "Uji bot", lastInboundAt: now },
    select: { id: true, isSandbox: true },
  });
  if (!conversation.isSandbox) throw new Error("SANDBOX_CONVERSATION_INVALID");

  const message = await prisma.waMessage.create({
    data: { conversationId: conversation.id, direction: "INBOUND", type: "text", body: text },
    select: { id: true },
  });
  await handleInboundMessage(message.id);
  return getSandboxState(userId);
}

/** Mulai ulang: pesan, order uji, dan percobaan lookup ikut terhapus (cascade). */
export async function resetSandbox(userId: string): Promise<void> {
  await prisma.waConversation.deleteMany({ where: { waId: sandboxWaId(userId), isSandbox: true } });
}
