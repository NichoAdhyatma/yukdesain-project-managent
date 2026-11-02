import { prisma } from "@/lib/db";

// Siapa owner di WhatsApp (docs/WHATSAPP_OWNER_COMMANDS.md §3). Identitas dari wa_id yang
// dijamin WhatsApp atau dari percakapan Uji bot milik owner, tidak pernah dari isi pesan.

export type OwnerContext = {
  user: { id: string; name: string };
  // PUBLISH: usulan terbit ke klien; DRAFT: Uji bot, usulan hanya masuk draft
  target: "PUBLISH" | "DRAFT";
};

const SANDBOX_OWNER_PREFIX = "sandbox-owner:";

/** Percakapan Uji bot berperan sebagai klien (docs/WHATSAPP_BOT_GUIDE.md §5). */
export function sandboxWaId(userId: string): string {
  return `sandbox:${userId}`;
}

/** Percakapan Uji bot berperan sebagai owner. Bukan angka, jadi tidak pernah cocok dengan wa_id. */
export function sandboxOwnerWaId(userId: string): string {
  return `${SANDBOX_OWNER_PREFIX}${userId}`;
}

async function activeOwner(where: { id: string } | { waNumber: string }) {
  return prisma.user.findFirst({
    where: { ...where, isActive: true, roles: { has: "OWNER" } },
    select: { id: true, name: true },
  });
}

export async function resolveOwner(conversation: { waId: string; isSandbox: boolean }): Promise<OwnerContext | null> {
  if (conversation.isSandbox) {
    if (!conversation.waId.startsWith(SANDBOX_OWNER_PREFIX)) return null;
    const user = await activeOwner({ id: conversation.waId.slice(SANDBOX_OWNER_PREFIX.length) });
    return user && { user, target: "DRAFT" };
  }
  const user = await activeOwner({ waNumber: conversation.waId });
  return user && { user, target: "PUBLISH" };
}

/** Nomor WhatsApp semua owner aktif yang sudah didaftarkan (tujuan pertanyaan luar katalog). */
export async function listOwnerNumbers(): Promise<{ id: string; name: string; waNumber: string }[]> {
  const owners = await prisma.user.findMany({
    where: { isActive: true, roles: { has: "OWNER" }, waNumber: { not: null } },
    select: { id: true, name: true, waNumber: true },
  });
  return owners.flatMap((o) => (o.waNumber ? [{ id: o.id, name: o.name, waNumber: o.waNumber }] : []));
}
