import type { ProjectStatus } from "@prisma/client";

// Status dan progres yang dilihat klien di portal tracking. Arti status mengikuti schema:
// DRAFT = brief belum dikirim; BELUM_DIKERJAKAN = brief sudah masuk, menunggu mulai dikerjakan.
// Progres = progres pengerjaan dari update desainer, bukan persentase pembayaran.

export const CLIENT_PROJECT_STATUS: Record<ProjectStatus, { label: string; description: string }> = {
  DRAFT: { label: "Menunggu Brief", description: "Isi brief dulu supaya project bisa mulai dikerjakan." },
  BELUM_DIKERJAKAN: { label: "Belum Dikerjakan", description: "Brief sudah kami terima. Desainer segera mulai mengerjakan." },
  SEDANG_DIKERJAKAN: { label: "Sedang Dikerjakan", description: "Desainer sedang mengerjakan project kamu." },
  SELESAI: { label: "Selesai", description: "Project telah selesai." },
};

type ProgressInput = {
  /** ProjectStatus; DTO portal mengirimnya sebagai string */
  status: ProjectStatus | (string & {});
  finalApprovedAt: string | null;
  updates: { progress: number | null; createdAt: string }[];
};

/** Persen progres pengerjaan (0–100) untuk portal klien. */
export function workProgressPercent(project: ProgressInput): number {
  if (project.status === "SELESAI" || project.finalApprovedAt) return 100;
  if (project.status !== "SEDANG_DIKERJAKAN") return 0;
  const latest = [...project.updates]
    .filter((u) => typeof u.progress === "number")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  return latest ? Math.min(100, Math.max(0, Math.round(latest.progress as number))) : 0;
}
