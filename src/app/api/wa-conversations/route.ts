import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/require-owner";
import { inboxQuerySchema, listInbox } from "@/lib/whatsapp/inbox";

// Inbox semua chat WhatsApp (docs/OWNER_NOTIFICATIONS_INBOX.md §3). Owner-only.
export async function GET(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const parsed = inboxQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Filter tidak valid" }, { status: 400 });
  return NextResponse.json(await listInbox(parsed.data));
}
