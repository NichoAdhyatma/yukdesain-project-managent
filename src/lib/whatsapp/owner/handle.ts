import Anthropic from "@anthropic-ai/sdk";
import { AiProviderError } from "@/lib/ai/client";
import { sendBotText } from "../bot-reply";
import { sanitizeReply } from "../ai/reply-guard";
import { runOwnerAiTurn } from "../ai/owner-conversation";
import { maskPhone } from "../phone";
import type { OwnerContext } from "./identity";
import {
  OWNER_REPLIES,
  applyProposal,
  cancelProposal,
  findPendingProposal,
  looksLikeConfirmationRequest,
  parseConfirmKeyword,
  proposalMessage,
  withoutFakeConfirmation,
} from "./proposals";
import { findFailedRelays, queryIdFromContext, relayOwnerAnswer, type RelayResult } from "./queries";

const RESEND_KEYWORD = /^\s*kirim\s*ulang\b/i;

/** Laporan hasil kirim yang sebenarnya, disusun server (bukan AI), supaya owner tahu klien sudah menerima atau belum. */
export function relayReport({ outcome, clientLabel }: RelayResult, isResend: boolean): string | null {
  switch (outcome) {
    case "sent":
      return `Jawaban untuk ${clientLabel} sudah terkirim ke klien.`;
    case "failed":
      return `Jawaban untuk ${clientLabel} tersimpan, tapi belum terkirim karena AI sedang gagal. Chat klien dialihkan ke admin. Balas *kirim ulang* untuk mencoba lagi, atau balas klien manual dari Inbox.`;
    case "admin":
      return `Jawaban untuk ${clientLabel} tersimpan, tapi tidak dikirim bot karena chat sedang ditangani admin. Balas klien manual dari Inbox.`;
    case "window_closed":
      return `Jawaban untuk ${clientLabel} tersimpan, tapi tidak bisa dikirim karena klien sudah lebih dari 24 jam tidak membalas. Balas klien manual.`;
    default:
      return isResend ? `Jawaban untuk ${clientLabel} sudah pernah terkirim.` : null;
  }
}

function errorReason(error: unknown): string {
  if (error instanceof AiProviderError) return `provider_${error.status ?? "network"}`;
  if (error instanceof Anthropic.APIError) return `api_${error.status ?? "connection"}`;
  return (error as Error).name;
}

// Pesan dari owner ke bot (docs/WHATSAPP_OWNER_COMMANDS.md §4–5). Tidak pernah membuat order,
// tidak terkena saklar "Balas otomatis" maupun rate limit klien.

export async function handleOwnerMessage(
  message: { id: string; type: string; body: string; contextWamid: string | null },
  conversation: { id: string; waId: string; isSandbox: boolean },
  owner: OwnerContext,
): Promise<void> {
  if (message.type !== "text") {
    await sendBotText(conversation, OWNER_REPLIES.textOnly);
    return;
  }

  const repliedQueryId = await queryIdFromContext(message.contextWamid);

  // "kirim ulang" dengan tepat satu jawaban yang gagal diteruskan: dikirim server tanpa AI (AI bisa sedang gagal).
  if (!repliedQueryId && RESEND_KEYWORD.test(message.body)) {
    const failed = await findFailedRelays(owner);
    if (failed.length === 1) {
      const report = relayReport(await relayOwnerAnswer(failed[0].id, { force: true }), true);
      if (report) await sendBotText(conversation, report);
      return;
    }
  }

  // YA/BATAL diperiksa server, bukan AI. Balasan ke pertanyaan klien tidak dianggap YA/BATAL.
  const keyword = repliedQueryId ? null : parseConfirmKeyword(message.body);
  if (keyword) {
    const pending = await findPendingProposal(conversation.id);
    if (pending) {
      const text = keyword === "YES" ? await applyProposal(pending, owner) : await cancelProposal(pending);
      await sendBotText(conversation, text);
      return;
    }
  }

  let turn: Awaited<ReturnType<typeof runOwnerAiTurn>>;
  try {
    turn = await runOwnerAiTurn({ owner, conversationId: conversation.id, repliedQueryId });
  } catch (error) {
    console.error(`[whatsapp] AI owner gagal untuk ${maskPhone(conversation.waId)}: ${errorReason(error)}`);
    await sendBotText(conversation, OWNER_REPLIES.busy);
    return;
  }

  if (turn.proposal) {
    await sendBotText(conversation, proposalMessage({ ...turn.proposal, target: owner.target }));
  } else if (turn.reply) {
    const sanitized = sanitizeReply(turn.reply);
    const text = sanitized.rejected
      ? OWNER_REPLIES.busy
      : looksLikeConfirmationRequest(sanitized.text)
        ? (withoutFakeConfirmation(sanitized.text) ?? OWNER_REPLIES.notRecorded)
        : sanitized.text;
    await sendBotText(conversation, text);
  } else if (turn.answeredQueryIds.length === 0 && turn.resendQueryIds.length === 0) {
    console.warn(`[whatsapp] AI owner tanpa balasan untuk ${maskPhone(conversation.waId)}: stop=${turn.stopReason ?? "-"}`);
    await sendBotText(conversation, OWNER_REPLIES.busy);
  }

  // Bot melanjutkan chat klien dengan jawaban owner, lalu owner menerima hasil kirim yang sebenarnya.
  const relays = [
    ...turn.answeredQueryIds.map((id) => ({ id, force: false })),
    ...turn.resendQueryIds.map((id) => ({ id, force: true })),
  ];
  for (const { id, force } of relays) {
    const report = relayReport(await relayOwnerAnswer(id, { force }), force);
    if (report) await sendBotText(conversation, report);
  }
}
