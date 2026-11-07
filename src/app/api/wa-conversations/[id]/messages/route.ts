import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { MANUAL_REPLY_MAX_LENGTH, isWithinServiceWindow, sendManualReply } from "@/lib/whatsapp/outbound";
import { getChannel, usesServiceWindow } from "@/lib/whatsapp/channel";
import { errorResponse, parseBody } from "@/lib/whatsapp/intake-api";
import { getInboxConversation, logConversationActivity } from "@/lib/whatsapp/inbox";

type Params = { params: Promise<{ id: string }> };

const messageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Pesan tidak boleh kosong")
    .max(MANUAL_REPLY_MAX_LENGTH, `Maksimal ${MANUAL_REPLY_MAX_LENGTH} karakter`),
});

// POST: balasan manual dari Inbox. Aturannya sama dengan /api/wa-intakes/[id]/messages: hanya saat mode admin
// (bot diam) dan, di Meta, masih dalam jendela 24 jam.
export async function POST(request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await parseBody(request, messageSchema);
  if (body.error) return body.error;

  const conversation = await prisma.waConversation.findFirst({
    where: { id, isSandbox: false },
    select: { id: true, waId: true, mode: true, lastInboundAt: true },
  });
  if (!conversation) return errorResponse("NOT_FOUND", "Percakapan tidak ditemukan");
  if (conversation.mode !== "HUMAN") return errorResponse("CONFLICT", "Chat masih dilayani bot. Ambil alih dulu sebelum membalas.");
  if (usesServiceWindow(await getChannel()) && !isWithinServiceWindow(conversation.lastInboundAt)) {
    return errorResponse(
      "UNPROCESSABLE_ENTITY",
      "Sudah lewat 24 jam sejak pesan terakhir klien. WhatsApp hanya mengizinkan template, jadi balasan manual tidak bisa dikirim.",
    );
  }

  const delivery = await sendManualReply(conversation, body.data.text, auth.user.id);
  await logConversationActivity(prisma, {
    conversationId: id,
    actorId: auth.user.id,
    action: "WA_MANUAL_REPLY",
    newValue: { messageId: delivery.messageId, ok: delivery.ok, ...(delivery.ok ? {} : { errorCode: delivery.errorCode }) },
  });
  return NextResponse.json({ conversation: await getInboxConversation(id), delivery });
}
