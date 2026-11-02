import { prisma } from "@/lib/db";
import { briefResponsesToEntries } from "@/lib/brief/responses";
import { handleInboundMessage } from "./bot";
import { sandboxOwnerWaId, sandboxWaId } from "./owner/identity";
import { findPendingProposal } from "./owner/proposals";
import { answerOwnerQuery, relayOwnerAnswer } from "./owner/queries";

export { sandboxWaId } from "./owner/identity";

// Uji bot dari Settings (docs/WHATSAPP_BOT_GUIDE.md §5, docs/WHATSAPP_OWNER_COMMANDS.md): percakapan
// sungguhan di DB dengan isSandbox = true, tanpa pengiriman WhatsApp. Per owner ada dua percakapan:
// sebagai klien (memakai draft panduan) dan sebagai owner (instruksi → usulan → YA masuk draft).

export type SandboxRole = "client" | "owner";

export const SANDBOX_MESSAGE_MAX_CHARS = 2000;
const TRANSCRIPT_LIMIT = 100;

const waIdFor = (userId: string, role: SandboxRole) => (role === "owner" ? sandboxOwnerWaId(userId) : sandboxWaId(userId));

const transcriptSelect = {
  id: true,
  isSandbox: true,
  mode: true,
  messages: {
    orderBy: { createdAt: "desc" as const },
    take: TRANSCRIPT_LIMIT,
    select: { id: true, direction: true, body: true, createdAt: true },
  },
};

async function clientState(userId: string) {
  const conversation = await prisma.waConversation.findUnique({
    where: { waId: sandboxWaId(userId) },
    select: {
      ...transcriptSelect,
      intakes: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          status: true,
          clientName: true,
          briefDraft: true,
          pricingRulesApplied: true,
          service: { select: { code: true, name: true } },
        },
      },
      ownerQueries: { where: { status: "PENDING" }, take: 1, select: { id: true, question: true } },
    },
  });
  // Penjagaan: waId sandbox:* hanya pernah dibuat oleh modul ini.
  if (!conversation?.isSandbox) return { mode: null, messages: [], intake: null, pendingOwnerQuery: null };

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
          pricingRules: Array.isArray(intake.pricingRulesApplied)
            ? (intake.pricingRulesApplied as { ruleId: string; name: string }[]).map((r) => ({ ruleId: r.ruleId, name: r.name }))
            : [],
        }
      : null,
    pendingOwnerQuery: conversation.ownerQueries[0] ?? null,
  };
}

async function ownerState(userId: string) {
  const conversation = await prisma.waConversation.findUnique({
    where: { waId: sandboxOwnerWaId(userId) },
    select: transcriptSelect,
  });
  if (!conversation?.isSandbox) return { messages: [], awaitingConfirmation: false };
  const pending = await findPendingProposal(conversation.id);
  return { messages: [...conversation.messages].reverse(), awaitingConfirmation: !!pending };
}

export async function getSandboxState(userId: string) {
  const [client, owner] = await Promise.all([clientState(userId), ownerState(userId)]);
  return { client, owner };
}

/** Simpan pesan owner (sebagai klien atau owner), lalu jalankan bot persis seperti pesan WhatsApp. */
export async function sendSandboxMessage(userId: string, text: string, role: SandboxRole = "client") {
  const now = new Date();
  const waId = waIdFor(userId, role);
  const conversation = await prisma.waConversation.upsert({
    where: { waId },
    update: { lastInboundAt: now },
    create: { waId, isSandbox: true, profileName: role === "owner" ? "Uji bot (owner)" : "Uji bot", lastInboundAt: now },
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

/** Jawab pertanyaan luar katalog dari percakapan uji, seolah owner membalas lewat WA. */
export async function answerSandboxQuery(userId: string, p: { queryId: string; approved: boolean; note: string | null }) {
  const query = await prisma.waOwnerQuery.findFirst({
    where: { id: p.queryId, status: "PENDING", conversation: { waId: sandboxWaId(userId), isSandbox: true } },
    select: { id: true },
  });
  if (!query) return null;
  await answerOwnerQuery(query.id, { approved: p.approved, note: p.note, answeredById: userId });
  await relayOwnerAnswer(query.id);
  return getSandboxState(userId);
}

/** Mulai ulang: pesan, order uji, usulan, dan pertanyaan ikut terhapus (cascade). */
export async function resetSandbox(userId: string, role?: SandboxRole): Promise<void> {
  const roles: SandboxRole[] = role ? [role] : ["client", "owner"];
  const waIds = roles.map((r) => waIdFor(userId, r));
  const conversations = await prisma.waConversation.findMany({
    where: { waId: { in: waIds }, isSandbox: true },
    select: { id: true },
  });
  const ids = conversations.map((c) => c.id);
  await prisma.waOwnerProposal.deleteMany({ where: { conversationId: { in: ids } } });
  await prisma.waConversation.deleteMany({ where: { id: { in: ids } } });
}
