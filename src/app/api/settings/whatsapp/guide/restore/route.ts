import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { restoreGuideVersion } from "@/lib/whatsapp/ai/bot-guide";
import { guideDto, validationError } from "@/lib/whatsapp/ai/bot-guide-api";

// Salin versi lama ke draft; belum berlaku untuk klien sampai diterbitkan.
const schema = z.object({ version: z.number().int().positive() });

export async function POST(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  const restored = await restoreGuideVersion(parsed.data.version);
  if (!restored) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Versi panduan tidak ditemukan" }, { status: 404 });
  }
  return NextResponse.json(await guideDto());
}
