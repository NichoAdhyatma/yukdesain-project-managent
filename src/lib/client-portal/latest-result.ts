// Hasil desain terbaru untuk halaman tracking klien (permintaan owner 2026-11-14: hasil tersembunyi di riwayat yang
// harus di-expand, dan di sana hanya berupa link nama file). Sumbernya lampiran gambar di update progres desainer;
// file final punya jalur sendiri (terkunci sampai lunas) dan tidak pernah menempel di update.

const IMAGE_FILE = /\.(jpe?g|png|webp|gif)$/i;
const EARLIER_LIMIT = 3;

type UpdateInput = {
  id: string;
  progress: number | null;
  description: string;
  createdAt: string;
  author: { name: string };
  attachment: { id: string; filename: string; storageKey: string } | null;
};

export type ResultImage = {
  updateId: string;
  storageKey: string;
  filename: string;
  createdAt: string;
  progress: number | null;
  description: string;
  author: string;
};

export type LatestResult = { latest: ResultImage; earlier: ResultImage[]; moreEarlier: number };

export function isImageFile(filename: string): boolean {
  return IMAGE_FILE.test(filename);
}

export function pickLatestResult(updates: UpdateInput[]): LatestResult | null {
  const images = updates
    .filter((u) => u.attachment && isImageFile(u.attachment.filename))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((u) => ({
      updateId: u.id,
      storageKey: u.attachment!.storageKey,
      filename: u.attachment!.filename,
      createdAt: u.createdAt,
      progress: u.progress,
      description: u.description,
      author: u.author.name,
    }));
  if (images.length === 0) return null;
  const [latest, ...rest] = images;
  return { latest, earlier: rest.slice(0, EARLIER_LIMIT), moreEarlier: Math.max(0, rest.length - EARLIER_LIMIT) };
}
