import Anthropic from "@anthropic-ai/sdk";
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
} from "./proposals";
import { queryIdFromContext, relayOwnerAnswer } from "./queries";

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
    const reason = error instanceof Anthropic.APIError ? `api_${error.status ?? "connection"}` : (error as Error).name;
    console.error(`[whatsapp] AI owner gagal untuk ${maskPhone(conversation.waId)}: ${reason}`);
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
        ? OWNER_REPLIES.notRecorded
        : sanitized.text;
    await sendBotText(conversation, text);
  } else if (turn.answeredQueryIds.length === 0) {
    await sendBotText(conversation, OWNER_REPLIES.busy);
  }

  // Setelah owner dapat konfirmasi: bot melanjutkan chat klien dengan jawaban owner.
  for (const queryId of turn.answeredQueryIds) {
    await relayOwnerAnswer(queryId);
  }
}
