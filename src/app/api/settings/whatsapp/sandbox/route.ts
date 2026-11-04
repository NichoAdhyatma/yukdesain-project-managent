import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { validationError } from "@/lib/whatsapp/ai/bot-guide-api";
import { isAiReady } from "@/lib/whatsapp/ai/ai-config";
import { SANDBOX_MESSAGE_MAX_CHARS, getSandboxState, resetSandbox, sendSandboxMessage } from "@/lib/whatsapp/sandbox";

// Uji bot (docs/WHATSAPP_BOT_GUIDE.md §5): berperan sebagai klien atau owner
// (docs/WHATSAPP_OWNER_COMMANDS.md). Owner-only; tidak ada yang dikirim ke WhatsApp.

// Satu giliran bot bisa beberapa panggilan Claude (tools).
export const maxDuration = 60;

const roleSchema = z.enum(["client", "owner"]);

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
  role: roleSchema.default("client"),
});

export async function POST(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  if (!(await isAiReady())) {
    return NextResponse.json(
      { error: "UNPROCESSABLE_ENTITY", message: "API key provider AI yang dipilih belum diisi di server, jadi bot belum bisa diuji." },
      { status: 422 },
    );
  }

  return NextResponse.json(await sendSandboxMessage(auth.user.id, parsed.data.text, parsed.data.role));
}

// DELETE ?role=client|owner; tanpa role = keduanya.
export async function DELETE(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const roleParam = new URL(request.url).searchParams.get("role");
  const role = roleParam ? roleSchema.safeParse(roleParam) : null;
  if (role && !role.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "role tidak dikenal" }, { status: 400 });
  }
  await resetSandbox(auth.user.id, role?.data);
  return NextResponse.json(await getSandboxState(auth.user.id));
}
