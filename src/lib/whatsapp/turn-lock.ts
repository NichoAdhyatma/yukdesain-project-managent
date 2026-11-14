// Antrean giliran bot per chat (produksi 2026-11-14, Ranie: giliran dari pesan klien dan giliran meneruskan jawaban
// owner berjalan bersamaan dan saling bertentangan dalam 5 detik). Satu proses Node di VPS, jadi cukup di memori.

const tails = new Map<string, Promise<unknown>>();

/** Jalankan `fn` setelah giliran sebelumnya di chat yang sama selesai (berhasil atau gagal). */
export async function withConversationLock<T>(conversationId: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(conversationId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  tails.set(conversationId, tail);
  try {
    return await run;
  } finally {
    if (tails.get(conversationId) === tail) tails.delete(conversationId);
  }
}
