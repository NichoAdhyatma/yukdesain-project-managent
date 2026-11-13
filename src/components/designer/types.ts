import type { ProjectStatus } from "@/types";
import { KANBAN_COLUMNS } from "@/lib/constants";

// Bentuk data dari GET /api/designer/projects.

export type DesignerAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  storageKey: string;
  url: string;
};

export type DesignerUpdate = {
  id: string;
  description: string;
  progress: number | null;
  author: { name: string };
  createdAt: string;
  attachment: DesignerAttachment | null;
};

export type DesignerRevision = {
  id: string;
  number: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  description: string;
  requestedAt: string;
  /** Diisi saat desainer menandai revisi selesai dikerjakan (docs/CLIENT_NOTIFICATIONS.md) */
  completedAt: string | null;
  attachments: DesignerAttachment[];
};

export type DesignerProject = {
  id: string;
  projectNumber: string;
  clientName: string;
  status: ProjectStatus;
  priority: string;
  deadline: string | null;
  service: { code: string; name: string };
  brief: {
    id: string;
    responses: Array<{ questionId: string; question: string; answer: string }>;
    /** Tambahan klien lewat bot setelah project berjalan (lib/projects/brief-change.ts) */
    clientUpdatedAt?: string | null;
  } | null;
  finalSubmittedAt?: string | null;
  finalApprovedAt?: string | null;
  updates: DesignerUpdate[];
  revisions: DesignerRevision[];
};

export const WORK_STATUSES = KANBAN_COLUMNS.map((c) => c.status);

export function statusLabel(status: ProjectStatus): string {
  if (status === "DRAFT") return "Menunggu Brief";
  return KANBAN_COLUMNS.find((c) => c.status === status)?.label ?? status;
}

export const STATUS_BADGE: Record<ProjectStatus, "default" | "secondary" | "outline"> = {
  DRAFT: "outline",
  BELUM_DIKERJAKAN: "secondary",
  SEDANG_DIKERJAKAN: "default",
  SELESAI: "outline",
};

export const PRIORITY_STYLE: Record<string, { label: string; className: string }> = {
  URGENT: { label: "Urgent", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  HIGH: { label: "Tinggi", className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  NORMAL: { label: "Normal", className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  LOW: { label: "Rendah", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

export const REVISION_STATUS: Record<DesignerRevision["status"], { label: string; variant: "secondary" | "default" | "destructive" }> = {
  PENDING: { label: "Menunggu", variant: "secondary" },
  APPROVED: { label: "Disetujui", variant: "default" },
  REJECTED: { label: "Ditolak", variant: "destructive" },
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isImage(attachment: { mimeType: string; url: string }): boolean {
  return attachment.mimeType.startsWith("image/") && !!attachment.url;
}
