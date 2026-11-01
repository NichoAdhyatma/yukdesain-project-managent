import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "./session";

// Pemeriksaan owner di handler (lapis kedua setelah proxy, AGENTS.md §37).
export async function requireOwner(): Promise<{ user: SessionUser; error?: never } | { user?: never; error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  if (!user.roles.includes("OWNER")) return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  return { user };
}
