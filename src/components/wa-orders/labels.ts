import type { WaIntakeStatus } from "./types";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

// Urutan tab: yang butuh tindakan admin lebih dulu.
export const STATUS_TABS: { status: WaIntakeStatus; label: string; needsAction: boolean }[] = [
  { status: "DP_REVIEW", label: "Verifikasi DP", needsAction: true },
  { status: "AWAITING_QUOTE", label: "Perlu Harga", needsAction: true },
  { status: "QUOTED", label: "Menunggu DP", needsAction: false },
  { status: "COLLECTING", label: "Sedang Konsultasi", needsAction: false },
  { status: "APPROVED", label: "Jadi Project", needsAction: false },
  { status: "CANCELLED", label: "Batal", needsAction: false },
];

export const STATUS_BADGE: Record<WaIntakeStatus, { label: string; variant: BadgeVariant }> = {
  COLLECTING: { label: "Sedang konsultasi", variant: "outline" },
  AWAITING_QUOTE: { label: "Perlu harga", variant: "default" },
  QUOTED: { label: "Menunggu DP", variant: "secondary" },
  DP_REVIEW: { label: "Verifikasi DP", variant: "default" },
  APPROVED: { label: "Jadi project", variant: "secondary" },
  CANCELLED: { label: "Batal", variant: "destructive" },
};

// Penjelasan flag bukti transfer untuk admin (§11.2). Flag tidak memblokir keputusan.
export const PROOF_FLAG_LABELS: Record<string, string> = {
  NOT_A_RECEIPT: "Gambar tidak terlihat seperti bukti transfer",
  UNREADABLE: "Sebagian isi bukti tidak terbaca",
  AMOUNT_BELOW_DP: "Nominal kurang dari DP",
  AMOUNT_MISMATCH: "Nominal tidak sama dengan DP maupun harga penuh",
  RECIPIENT_NOT_STUDIO: "Penerima bukan rekening studio yang aktif",
  DATE_BEFORE_QUOTE: "Tanggal transfer sebelum penawaran dikirim",
  DUPLICATE_IMAGE: "Gambar yang sama pernah dipakai di order lain",
  DUPLICATE_REFERENCE: "Nomor referensi sama dengan bukti lain",
};

export const formatRupiah = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "-"
    : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

export const formatDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }) : "-";

export const formatDateTime = (d: string) =>
  new Date(d).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

export function formatRelative(d: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(d).getTime()) / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} hari lalu` : formatDate(d);
}

/** Kode error kirim WhatsApp → kalimat untuk admin. */
export function deliveryErrorText(code: string): string {
  if (code === "NOT_CONFIGURED") return "Pengaturan WhatsApp di server belum lengkap.";
  if (code === "132001") return "Template belum disetujui Meta.";
  if (code === "131047") return "Klien sudah lebih dari 24 jam tidak membalas dan template gagal dikirim.";
  return `Kode error ${code}.`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Tanggal dari struk (waktu lokal, tanpa konversi zona): "2026-10-31T09:00:00" → "31 Okt 2026 09.00". */
export function formatReceiptDate(raw: string | null): string {
  if (!raw) return "-";
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return raw;
  const [, y, mo, d, h, mi] = m;
  const date = `${Number(d)} ${MONTHS[Number(mo) - 1] ?? mo} ${y}`;
  return h ? `${date} ${h}.${mi}` : date;
}
