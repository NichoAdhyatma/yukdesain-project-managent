import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/require-owner";
import { buildBrain } from "@/lib/whatsapp/ai/brain";

// Otak bot (docs/WHATSAPP_BOT_BRAIN_VIEW.md): hanya membaca, owner-only.
// ?source=draft = yang dipakai Uji bot; selain itu versi terbit yang dipakai klien.

export async function GET(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const source = new URL(request.url).searchParams.get("source") === "draft" ? "draft" : "published";
  return NextResponse.json(await buildBrain(source));
}
