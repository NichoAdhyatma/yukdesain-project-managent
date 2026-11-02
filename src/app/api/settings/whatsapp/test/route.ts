import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isAiConfigured } from "@/lib/whatsapp/env";
import { getAiConfig } from "@/lib/whatsapp/ai/ai-config";
import { testAiConnection } from "@/lib/whatsapp/ai/connection-test";

export const maxDuration = 60;

// Uji konfigurasi AI yang sudah tersimpan (bukan nilai yang belum disimpan),
// supaya key tidak terkirim ke URL yang baru diketik.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!user.roles.includes("OWNER")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  // Hanya butuh env Claude, supaya bisa diuji sebelum setup Meta selesai.
  if (!isAiConfigured()) {
    return NextResponse.json({ error: "UNPROCESSABLE_ENTITY", message: "ANTHROPIC_API_KEY di server belum diisi" }, { status: 422 });
  }

  const config = await getAiConfig();
  const checks = await testAiConnection(config);
  return NextResponse.json({
    model: config.model,
    baseUrlHost: new URL(config.baseUrl).host,
    ok: checks.every((c) => c.ok),
    checks,
  });
}
