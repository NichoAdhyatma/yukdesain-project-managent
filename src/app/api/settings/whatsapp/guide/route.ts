import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/require-owner";
import { botGuideSchema, saveDraftGuide } from "@/lib/whatsapp/ai/bot-guide";
import { guideDto, validationError } from "@/lib/whatsapp/ai/bot-guide-api";

// Draft panduan bot (docs/WHATSAPP_BOT_GUIDE.md §4). Menyimpan draft tidak mengubah bot
// untuk klien; hanya Uji bot yang memakainya sampai diterbitkan.

export async function GET() {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  return NextResponse.json(await guideDto());
}

export async function PUT(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  const parsed = botGuideSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  await saveDraftGuide(parsed.data);
  return NextResponse.json(await guideDto());
}
