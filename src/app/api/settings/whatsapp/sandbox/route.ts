import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { validationError } from "@/lib/whatsapp/ai/bot-guide-api";
import { isAiConfigured } from "@/lib/whatsapp/env";
import { SANDBOX_MESSAGE_MAX_CHARS, getSandboxState, resetSandbox, sendSandboxMessage } from "@/lib/whatsapp/sandbox";

// Uji bot (docs/WHATSAPP_BOT_GUIDE.md §5). Owner-only; tidak ada yang dikirim ke WhatsApp.

// Satu giliran bot bisa beberapa panggilan Claude (tools).
export const maxDuration = 60;

export async function GET() {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  return NextResponse.json(await getSandboxState(auth.user.id));
}

const schema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Pesan wajib diisi")
    .max(SANDBOX_MESSAGE_MAX_CHARS, `Maksimal ${SANDBOX_MESSAGE_MAX_CHARS} karakter`),
});

export async function POST(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "UNPROCESSABLE_ENTITY", message: "ANTHROPIC_API_KEY di server belum diisi, jadi bot belum bisa diuji." },
      { status: 422 },
    );
  }

  return NextResponse.json(await sendSandboxMessage(auth.user.id, parsed.data.text));
}

export async function DELETE() {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  await resetSandbox(auth.user.id);
  return NextResponse.json(await getSandboxState(auth.user.id));
}
