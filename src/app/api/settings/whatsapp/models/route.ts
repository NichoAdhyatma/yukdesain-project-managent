import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/require-owner";
import { resolveProvider } from "@/lib/ai/providers";
import { fallbackModels, listModels } from "@/lib/whatsapp/ai/model-list";

// GET /api/settings/whatsapp/models?providerKey=env:ANTHROPIC|env:GATEWAY|db:<id> — isi pilihan model di Bot AI › Model.
// `provider=ANTHROPIC|GATEWAY` (bentuk lama) tetap diterima.
export async function GET(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const legacy = params.get("provider");
  const providerKey = params.get("providerKey") ?? (legacy ? `env:${legacy}` : null);
  if (!providerKey) return NextResponse.json({ error: "VALIDATION_ERROR", message: "providerKey wajib" }, { status: 400 });
  try {
    return NextResponse.json(await listModels(await resolveProvider(providerKey)));
  } catch {
    // Key belum ada / provider tidak bisa dibuka: tetap tampilkan daftar cadangan (provider bawaan).
    return NextResponse.json({ models: fallbackModels(providerKey), source: "fallback" });
  }
}
