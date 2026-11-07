import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { listOwnerNumbers } from "@/lib/whatsapp/owner/identity";
import { errorResponse, parseBody } from "@/lib/whatsapp/intake-api";
import { getInboxConversation, logConversationActivity } from "@/lib/whatsapp/inbox";

type Params = { params: Promise<{ id: string }> };

const blockSchema = z.object({ blocked: z.boolean() });

// POST: blokir / buka blokir dari Inbox (docs/WHATSAPP_SPAM_GUARD.md §5), juga untuk nomor tanpa order.
export async function POST(request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await parseBody(request, blockSchema);
  if (body.error) return body.error;
  const { blocked } = body.data;

  const conversation = await prisma.waConversation.findFirst({ where: { id, isSandbox: false }, select: { waId: true } });
  if (!conversation) return errorResponse("NOT_FOUND", "Percakapan tidak ditemukan");
  if (blocked && (await listOwnerNumbers()).some((o) => o.waNumber === conversation.waId)) {
    return errorResponse("CONFLICT", "Nomor owner tidak bisa diblokir.");
  }

  const changed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.waConversation.updateMany({
      where: { id, blockedAt: blocked ? null : { not: null } },
      data: blocked ? { blockedAt: new Date(), blockedById: auth.user.id } : { blockedAt: null, blockedById: null },
    });
    if (count === 0) return false;
    await logConversationActivity(tx, {
      conversationId: id,
      actorId: auth.user.id,
      action: blocked ? "WA_NUMBER_BLOCKED" : "WA_NUMBER_UNBLOCKED",
      previousValue: { blocked: !blocked },
      newValue: { blocked },
    });
    return true;
  });
  if (!changed) return errorResponse("CONFLICT", blocked ? "Nomor ini sudah diblokir." : "Nomor ini tidak sedang diblokir.");
  return NextResponse.json({ conversation: await getInboxConversation(id) });
}
