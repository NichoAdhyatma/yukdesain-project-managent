import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { GuideConflictError, publishDraftGuide } from "@/lib/whatsapp/ai/bot-guide";
import { guideDto } from "@/lib/whatsapp/ai/bot-guide-api";

// Draft → versi aktif untuk klien (docs/WHATSAPP_BOT_GUIDE.md §4).
export async function POST() {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  let published;
  try {
    published = await publishDraftGuide(auth.user.id);
  } catch (error) {
    if (error instanceof GuideConflictError) {
      return NextResponse.json({ error: "CONFLICT", message: error.message }, { status: 409 });
    }
    throw error;
  }

  await prisma.activityLog.create({
    data: {
      entityType: "StudioSettings",
      entityId: "default",
      action: "WA_BOT_GUIDE_PUBLISHED",
      actorId: auth.user.id,
      newValue: { version: published.version },
    },
  });

  return NextResponse.json(await guideDto());
}
