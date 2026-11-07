import { formatWorkingHours, isWithinWorkingHours, type StudioOperations } from "@/lib/studio-operations";

// Balasan saat chat dialihkan ke admin. Di luar jam kerja (Operasional studio, docs/STUDIO_OPERATIONS.md)
// bot tetap membalas, tetapi memberi tahu kapan admin aktif.

export const HANDOFF_IN_HOURS = "Baik kak, percakapan ini kami teruskan ke admin. Admin kami akan membalas secepatnya ya.";

export function handoffReply(ops: StudioOperations, now: Date): string {
  if (isWithinWorkingHours(now, ops)) return HANDOFF_IN_HOURS;
  return `Baik kak, percakapan ini kami teruskan ke admin. ${ops.outsideHoursNote} (Jam kerja: ${formatWorkingHours(ops)})`;
}
