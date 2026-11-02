import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AiNotConfiguredError, getAiConfig } from "@/lib/whatsapp/ai/ai-config";
import { testAiConnection } from "@/lib/whatsapp/ai/connection-test";

export const maxDuration = 60;

// Uji konfigurasi AI yang sudah tersimpan (bukan nilai yang belum disimpan),
// supaya key tidak terkirim ke URL yang baru diketik.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!user.roles.includes("OWNER")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  // Hanya butuh key provider AI aktif, supaya bisa diuji sebelum setup Meta selesai.
  let config;
  try {
    config = await getAiConfig();
  } catch (error) {
    if (!(error instanceof AiNotConfiguredError)) throw error;
    return NextResponse.json(
      { error: "UNPROCESSABLE_ENTITY", message: "API key provider AI yang dipilih belum diisi di server" },
      { status: 422 },
    );
  }
  const checks = await testAiConnection(config);
  return NextResponse.json({
    model: config.model,
    provider: config.label,
    baseUrlHost: new URL(config.baseUrl).host,
    ok: checks.every((c) => c.ok),
    checks,
  });
}
