import { prisma } from "@/lib/db";
import { PROGRESS_COOLDOWN_MS, sendNoticeNow } from "./client-project-events";

// Kirim kabar progres yang tertahan jeda 60 menit (docs/CLIENT_NOTIFICATIONS.md). Dipanggil cron setiap 5 menit.
// Klaim atomik PENDING → SENDING mencegah notice yang sama terkirim dua kali bila cron berjalan bersamaan.

export async function flushPendingNotices(now: Date): Promise<{ sent: number; skipped: number; failed: number }> {
  const pending = await prisma.clientProjectNotice.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { id: true, projectId: true, createdAt: true },
  });
  const result = { sent: 0, skipped: 0, failed: 0 };
  for (const notice of pending) {
    const lastSent = await prisma.clientProjectNotice.findFirst({
      where: { projectId: notice.projectId, event: "PROGRESS", status: "SENT" },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    });
    // Sudah ada kabar progres yang lebih baru dari notice ini (mis. cron sempat mati): buang, jangan kirim mundur.
    if (lastSent?.sentAt && notice.createdAt < lastSent.sentAt) {
      const dropped = await prisma.clientProjectNotice.updateMany({
        where: { id: notice.id, status: "PENDING" },
        data: { status: "SKIPPED", reason: "SUPERSEDED" },
      });
      if (dropped.count > 0) result.skipped++;
      continue;
    }
    if (lastSent?.sentAt && now.getTime() - lastSent.sentAt.getTime() < PROGRESS_COOLDOWN_MS) continue;
    const claimed = await prisma.clientProjectNotice.updateMany({
      where: { id: notice.id, status: "PENDING" },
      data: { status: "SENDING" },
    });
    if (claimed.count === 0) continue;
    const outcome = await sendNoticeNow(notice.id);
    if (outcome === "SENT") result.sent++;
    else if (outcome === "FAILED") result.failed++;
    else result.skipped++;
  }
  return result;
}
