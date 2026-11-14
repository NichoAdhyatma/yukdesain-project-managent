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
  /** Cara kirim hasil akhir (2026-11-14): file di portal (default), link Drive, atau lewat WhatsApp */
  delivery?: FinalDelivery;
};

export type FinalDelivery = "FILE" | "LINK" | "WHATSAPP";

const NOTE_MAX = 300;

const greet = (name: string | null) => (name ? `Halo kak ${name},` : "Halo kak,");
const clip = (text: string) => (text.length > NOTE_MAX ? `${text.slice(0, NOTE_MAX)}…` : text);
const link = (label: string, url: string | null) => (url ? [`${label} ${url}`] : []);

/** File final terbuka setelah lunas: sisa tagihan dan cara bayar. */
const LOCKED_LINE: Record<FinalDelivery, (amount: string) => string> = {
  FILE: (a) => `File final bisa diunduh setelah pelunasan *${a}*.`,
  LINK: (a) => `Link file final bisa dibuka setelah pelunasan *${a}*.`,
  WHATSAPP: (a) => `File final kami kirim lewat WhatsApp setelah pelunasan *${a}*.`,
};

function settlement(d: ClientNoticeData): string[] {
  if (!d.balance || d.balance <= 0) return [];
  const accounts = d.accounts ?? [];
  return [
    LOCKED_LINE[d.delivery ?? "FILE"](formatRupiah(d.balance)),
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
      const delivery = d.delivery ?? "FILE";
      const paidAction: Record<FinalDelivery, string> = {
        FILE: "Cek, setujui, dan unduh filenya lewat link ini:",
        LINK: "Cek, setujui, dan buka link filenya lewat link ini:",
        WHATSAPP: "Cek dan setujui lewat link ini:",
      };
      const action = unpaid.length ? "Cek dan setujui lewat link ini:" : paidAction[delivery];
      const viaWhatsApp = !unpaid.length && delivery === "WHATSAPP" ? ["File finalnya kami kirim lewat WhatsApp di chat ini ya kak."] : [];
      return [greet(d.clientName), `Hasil final project ${service} sudah siap.`, ...link(action, d.portalUrl), ...unpaid, ...viaWhatsApp].join("\n");
    }
    case "REVISION_DONE":
      return [greet(d.clientName), `Revisi #${d.revisionNumber ?? ""} untuk project ${service} sudah dikerjakan.`, ...link("Cek hasilnya di sini:", d.portalUrl)].join("\n");
    case "COMPLETED":
      return [
        greet(d.clientName),
        `Project ${service} sudah selesai. Terima kasih sudah mempercayakan desainnya ke ${d.studioName}.`,
        ...settlement(d),
      ].join("\n");
    case "FILES_UNLOCKED": {
      const thanks = `Pelunasan project ${service} sudah kami terima, terima kasih.`;
      if (d.delivery === "WHATSAPP") return [greet(d.clientName), `${thanks} File final segera kami kirim lewat WhatsApp di chat ini.`].join("\n");
      if (d.delivery === "LINK") return [greet(d.clientName), `${thanks} Link file final sudah bisa dibuka.`, ...link("Buka di sini:", d.portalUrl)].join("\n");
      return [greet(d.clientName), `${thanks} File final sudah bisa diunduh.`, ...link("Unduh di sini:", d.portalUrl)].join("\n");
    }
  }
}
