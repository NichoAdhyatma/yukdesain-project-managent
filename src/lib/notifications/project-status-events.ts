import type { ProjectStatus } from "@prisma/client";
import type { ClientProjectEvent } from "./client-project-events";

// Perubahan status project yang dikabarkan ke klien (docs/CLIENT_NOTIFICATIONS.md). Kabar "mulai dikerjakan" ganda
// (kartu kanban digeser bolak-balik) dicegah oleh unik (projectId, event, refId) di ClientProjectNotice.
export function eventForStatusChange(from: ProjectStatus, to: ProjectStatus): ClientProjectEvent | null {
  if (from === to) return null;
  if (to === "SEDANG_DIKERJAKAN") return { kind: "STARTED" };
  if (to === "SELESAI") return { kind: "COMPLETED" };
  return null;
}
