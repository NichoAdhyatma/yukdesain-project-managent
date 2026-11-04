import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { validationError } from "@/lib/whatsapp/ai/bot-guide-api";
import { isAiReady } from "@/lib/whatsapp/ai/ai-config";
import { answerSandboxQuery } from "@/lib/whatsapp/sandbox";

// Jawab pertanyaan luar katalog dari percakapan uji, seolah owner membalas lewat WA
// (docs/WHATSAPP_OWNER_COMMANDS.md §5). Bot lalu melanjutkan chat uji dengan jawaban ini.
export const maxDuration = 60;

const schema = z.object({
  queryId: z.string().min(1),
  approved: z.boolean(),
  note: z.string().trim().max(1000).optional(),
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

  const state = await answerSandboxQuery(auth.user.id, {
    queryId: parsed.data.queryId,
    approved: parsed.data.approved,
    note: parsed.data.note || null,
  });
  if (!state) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Pertanyaan tidak ditemukan atau sudah dijawab" }, { status: 404 });
  }
  return NextResponse.json(state);
}
