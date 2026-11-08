// Teks kabar otomatis ke klien (docs/CLIENT_NOTIFICATIONS.md). Hanya data yang memang boleh dilihat klien:
// layanan, persen, catatan update, nomor revisi, link portal. Tanpa nama desainer, nominal, atau catatan internal.

export type ClientNoticeKind = "STARTED" | "PROGRESS" | "FINAL_SUBMITTED" | "REVISION_DONE" | "COMPLETED";

export type ClientNoticeData = {
  clientName: string | null;
  serviceName: string;
  portalUrl: string | null;
  studioName: string;
  progress?: number | null;
  note?: string;
  revisionNumber?: number;
};

const NOTE_MAX = 300;

const greet = (name: string | null) => (name ? `Halo kak ${name},` : "Halo kak,");
const clip = (text: string) => (text.length > NOTE_MAX ? `${text.slice(0, NOTE_MAX)}…` : text);
const link = (label: string, url: string | null) => (url ? [`${label} ${url}`] : []);

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
    case "FINAL_SUBMITTED":
      return [greet(d.clientName), `Hasil final project ${service} sudah siap.`, ...link("Cek dan setujui lewat link ini:", d.portalUrl)].join("\n");
    case "REVISION_DONE":
      return [greet(d.clientName), `Revisi #${d.revisionNumber ?? ""} untuk project ${service} sudah dikerjakan.`, ...link("Cek hasilnya di sini:", d.portalUrl)].join("\n");
    case "COMPLETED":
      return [greet(d.clientName), `Project ${service} sudah selesai. Terima kasih sudah mempercayakan desainnya ke ${d.studioName}.`].join("\n");
  }
}
