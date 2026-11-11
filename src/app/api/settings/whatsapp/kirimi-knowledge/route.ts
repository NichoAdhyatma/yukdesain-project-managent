import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/require-owner";
import { loadKirimiKnowledge } from "@/lib/whatsapp/kirimi-knowledge";

// Knowledge .md untuk Agen AI Kirimi (docs/WHATSAPP_CHANNEL_KIRIMI.md): hanya membaca, owner-only.
// ?source=draft = Panduan draft + semua layanan; selain itu Panduan terbit + layanan aktif.

export async function GET(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const source = new URL(request.url).searchParams.get("source") === "draft" ? "draft" : "published";
  return NextResponse.json(await loadKirimiKnowledge(source), { headers: { "Cache-Control": "no-store" } });
}
