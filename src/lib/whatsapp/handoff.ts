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

/**
 * true paling banyak sekali per `intervalMs` untuk `key`. Cek dan catat terjadi tanpa jeda await, jadi pesan yang masuk
 * bersamaan (12 foto sekaligus, Mif 13 Nov) tidak lolos semua.
 */
export function onceWithin(key: string, intervalMs: number, now = Date.now()): boolean {
  const last = lastCalled.get(key);
  if (last !== undefined && now - last < intervalMs) return false;
  lastCalled.set(key, now);
  return true;
}

/** Panggil admin tanpa memindahkan chat ke mode admin (docs/OWNER_NOTIFICATIONS_INBOX.md §2). */
export function callAdmin(conversationId: string, reason: HandoffReason, now = Date.now()): void {
  if (!onceWithin(`${conversationId}:${reason}`, CALL_ADMIN_INTERVAL_MS, now)) return;
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
