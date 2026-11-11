import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { getResponderStatus, switchResponder } from "@/lib/whatsapp/responder";

// Ganti penjawab chat klien: bot portal atau Agen AI Kirimi (docs/WHATSAPP_CHANNEL_KIRIMI.md "Ganti penjawab").

const switchSchema = z.discriminatedUnion("to", [
  z.object({
    to: z.literal("PORTAL"),
    returnConversationIds: z.array(z.string().min(1)).max(500),
    kirimiOffConfirmed: z.boolean().optional(),
  }),
  z.object({ to: z.literal("KIRIMI") }),
]);

const MESSAGES = {
  KIRIMI_AI_ON: "Kirimi masih melaporkan Agen AI aktif. Matikan di dashboard Kirimi; bila sudah, centang konfirmasinya.",
  KIRIMI_UNCONFIRMED: "Status Agen AI Kirimi tidak terbaca. Pastikan sudah dimatikan di dashboard Kirimi, lalu centang konfirmasinya.",
} as const;

export async function GET() {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  return NextResponse.json(await getResponderStatus(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const parsed = switchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Data tidak valid" }, { status: 400 });

  const result = await switchResponder(parsed.data, auth.user.id);
  if (!result.ok) return NextResponse.json({ error: result.error, message: MESSAGES[result.error] }, { status: 409 });
  return NextResponse.json({ ...result, status: await getResponderStatus() });
}
