import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/require-owner";
import { getInboxConversation } from "@/lib/whatsapp/inbox";

type Params = { params: Promise<{ id: string }> };

// Detail satu percakapan di Inbox. Owner-only; percakapan Uji bot tidak ditemukan (404).
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;
  const conversation = await getInboxConversation(id);
  if (!conversation) return NextResponse.json({ error: "NOT_FOUND", message: "Percakapan tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ conversation });
}
