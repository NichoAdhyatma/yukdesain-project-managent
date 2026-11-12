import { formatRupiah } from "@/lib/whatsapp/format";

// Teks kabar otomatis ke klien (docs/CLIENT_NOTIFICATIONS.md). Hanya data yang memang boleh dilihat klien:
// layanan, persen, catatan update, nomor revisi, link portal, dan (hasil final/selesai belum lunas, 2026-11-12) sisa
// pelunasan project ini beserta rekening aktif. Tanpa nama desainer atau catatan internal.

export type ClientNoticeKind = "STARTED" | "PROGRESS" | "FINAL_SUBMITTED" | "REVISION_DONE" | "COMPLETED" | "FILES_UNLOCKED";

export type ClientNoticeData = {
  clientName: string | null;
  serviceName: string;
  portalUrl: string | null;
  studioName: string;
  progress?: number | null;
  note?: string;
  revisionNumber?: number;
  /** Sisa pelunasan project (hasil final / selesai); > 0 = file final masih terkunci */
  balance?: number;
  /** Rekening aktif untuk pelunasan */
  accounts?: { name: string; accountNumber: string; accountHolder: string }[];
};

const NOTE_MAX = 300;

const greet = (name: string | null) => (name ? `Halo kak ${name},` : "Halo kak,");
const clip = (text: string) => (text.length > NOTE_MAX ? `${text.slice(0, NOTE_MAX)}…` : text);
const link = (label: string, url: string | null) => (url ? [`${label} ${url}`] : []);

/** File final terbuka setelah lunas: sisa tagihan dan cara bayar. */
function settlement(d: ClientNoticeData): string[] {
  if (!d.balance || d.balance <= 0) return [];
  const accounts = d.accounts ?? [];
  return [
    `File final bisa diunduh setelah pelunasan *${formatRupiah(d.balance)}*.`,
    ...(accounts.length
      ? ["Pembayaran ke:", ...accounts.map((a) => `• ${a.name} ${a.accountNumber} a.n. ${a.accountHolder}`)]
      : []),
    "Setelah transfer, kirim bukti transfernya di chat ini ya kak.",
  ];
}

export function clientNoticeText(kind: ClientNoticeKind, d: ClientNoticeData): string {
  const service = `*${d.serviceName}*`;
  switch (kind) {
    case "STARTED":
      return [`${greet(d.clientName)} project ${service} mulai dikerjakan desainer kami.`, ...link("Pantau progresnya di sini:", d.portalUrl)].join("\n");
    case "PROGRESS": {
      const percent = typeof d.progress === "number" ? `: progres *${d.progress}%*.` : ".";
      const note = d.note?.trim() ? [`Catatan: ${clip(d.note.trim())}`] : [];
      return [greet(d.clientName), `Update project ${service}${percent}`, ...note, ...link("Lihat detail dan file:", d.portalUrl)].join("\n");
    }
    case "FINAL_SUBMITTED": {
      const unpaid = settlement(d);
      const action = unpaid.length ? "Cek dan setujui lewat link ini:" : "Cek, setujui, dan unduh filenya lewat link ini:";
      return [greet(d.clientName), `Hasil final project ${service} sudah siap.`, ...link(action, d.portalUrl), ...unpaid].join("\n");
    }
    case "REVISION_DONE":
      return [greet(d.clientName), `Revisi #${d.revisionNumber ?? ""} untuk project ${service} sudah dikerjakan.`, ...link("Cek hasilnya di sini:", d.portalUrl)].join("\n");
    case "COMPLETED":
      return [
        greet(d.clientName),
        `Project ${service} sudah selesai. Terima kasih sudah mempercayakan desainnya ke ${d.studioName}.`,
        ...settlement(d),
      ].join("\n");
    case "FILES_UNLOCKED":
      return [
        greet(d.clientName),
        `Pelunasan project ${service} sudah kami terima, terima kasih. File final sudah bisa diunduh.`,
        ...link("Unduh di sini:", d.portalUrl),
      ].join("\n");
  }
}
