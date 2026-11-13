import { prisma } from "@/lib/db";
import { notifyNeedsAdmin, type HandoffReason } from "@/lib/notifications/owner-events";

// Keputusan owner 2026-11-13: chat pindah ke mode admin (HUMAN) hanya bila admin sendiri membalas (dari HP, tombol
// Ambil alih, atau balasan dari portal). Saat bot butuh admin (klien minta admin, AI gagal, batas harian/bulanan,
// pertanyaan owner kedaluwarsa, bukti transfer terlalu banyak, request_human_handoff), owner hanya dipanggil lewat
// notifikasi dan bot tetap melayani chat itu.

/** Notifikasi "butuh admin" paling banyak sekali per chat + alasan per rentang ini. */
export const CALL_ADMIN_INTERVAL_MS = 30 * 60_000;

// Satu proses Node di VPS: cukup di memori; restart hanya membuat satu notifikasi lebih awal.
const lastCalled = new Map<string, number>();

/** Untuk tes: kosongkan batas notifikasi. */
export function resetCallAdminThrottle(): void {
  lastCalled.clear();
}

/** Panggil admin tanpa memindahkan chat ke mode admin (docs/OWNER_NOTIFICATIONS_INBOX.md §2). */
export function callAdmin(conversationId: string, reason: HandoffReason, now = Date.now()): void {
  const key = `${conversationId}:${reason}`;
  const last = lastCalled.get(key);
  if (last !== undefined && now - last < CALL_ADMIN_INTERVAL_MS) return;
  lastCalled.set(key, now);
  // Tidak ditunggu: notifikasi lambat tidak boleh menunda balasan ke klien.
  void notifyNeedsAdmin(conversationId, reason);
}

/** Pesan keluar terakhir chat ini sama persis dengan `body`? Pesan sistem (sibuk, batas) cukup dikirim sekali. */
export async function lastOutboundIs(conversationId: string, body: string): Promise<boolean> {
  const last = await prisma.waMessage.findFirst({
    where: { conversationId, direction: "OUTBOUND" },
    orderBy: { createdAt: "desc" },
    select: { body: true },
  });
  return last?.body === body;
}
