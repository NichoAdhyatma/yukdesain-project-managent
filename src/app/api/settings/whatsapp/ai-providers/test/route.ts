import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { runModelTest } from "@/lib/ai/model-tests";
import { AiProviderUnavailableError, aiModelIdSchema } from "@/lib/ai/providers";
import { KeyCryptoUnavailableError } from "@/lib/ai/key-crypto";

export const maxDuration = 60;

// Tes satu model di satu provider: Koneksi, Tool use, Gambar. Hasil disimpan (syarat pakai).
const schema = z.object({ providerKey: z.string().min(1), model: aiModelIdSchema });

export async function POST(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", fields: { model: parsed.error.issues[0]?.message ?? "Tidak valid" } }, { status: 400 });
  }
  try {
    const result = await runModelTest(parsed.data.providerKey, parsed.data.model);
    return NextResponse.json({ ...result, ok: result.checks.every((c) => c.ok) });
  } catch (error) {
    if (error instanceof AiProviderUnavailableError || error instanceof KeyCryptoUnavailableError) {
      return NextResponse.json({ error: "UNPROCESSABLE_ENTITY", message: error.message }, { status: 422 });
    }
    throw error;
  }
}
