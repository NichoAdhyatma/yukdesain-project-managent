import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStudioSettings } from "@/lib/studio";
import { getAppPublicUrl } from "@/lib/whatsapp/env";
import { sendSystemText } from "@/lib/whatsapp/outbound";
import { clientNoticeText, type ClientNoticeData, type ClientNoticeKind } from "./client-notice-text";

// Kabar otomatis ke klien saat order berubah (docs/CLIENT_NOTIFICATIONS.md). Dipanggil lewat after() dari route
// pemicu; tidak pernah melempar error, supaya aksi desainer/owner tidak ikut gagal.

export type ClientProjectEvent =
  | { kind: "STARTED" }
  | { kind: "PROGRESS"; updateId: string }
  | { kind: "FINAL_SUBMITTED" }
  | { kind: "REVISION_DONE"; revisionId: string }
  | { kind: "COMPLETED" };

export type NoticeOutcome = "SENT" | "SKIPPED" | "PENDING" | "FAILED" | "DUPLICATE";

/** Maksimal satu kabar progres per project per jeda ini; update di dalam jeda menunggu cron (Task 5). */
export const PROGRESS_COOLDOWN_MS = 60 * 60_000;

const refIdOf = (event: ClientProjectEvent) =>
  event.kind === "PROGRESS" ? event.updateId : event.kind === "REVISION_DONE" ? event.revisionId : "-";

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

type ProjectForNotice = {
  id: string;
  clientId: string;
  clientName: string;
  service: { name: string };
  clientLinks: { token: string }[];
};

async function loadProject(projectId: string): Promise<ProjectForNotice | null> {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      clientId: true,
      clientName: true,
      service: { select: { name: true } },
      clientLinks: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1, select: { token: true } },
    },
  });
}

function portalUrl(project: ProjectForNotice): string | null {
  const base = getAppPublicUrl();
  const token = project.clientLinks[0]?.token;
  return base && token ? `${base.replace(/\/+$/, "")}/client/${token}` : null;
}

/** Data tambahan per kejadian; null = kejadian tidak perlu dikabarkan (mis. desainer tidak mencentang). */
async function eventData(event: ClientProjectEvent): Promise<Partial<ClientNoticeData> | null> {
  if (event.kind === "PROGRESS") {
    const update = await prisma.projectUpdate.findUnique({
      where: { id: event.updateId },
      select: { progress: true, description: true, notifyClient: true },
    });
    if (!update || !update.notifyClient) return null;
    return { progress: update.progress, note: update.description };
  }
  if (event.kind === "REVISION_DONE") {
    const revision = await prisma.revision.findUnique({ where: { id: event.revisionId }, select: { number: true } });
    return revision ? { revisionNumber: revision.number } : null;
  }
  return {};
}

async function finish(noticeId: string, status: "SENT" | "SKIPPED" | "FAILED", reason?: string): Promise<NoticeOutcome> {
  await prisma.clientProjectNotice.update({
    where: { id: noticeId },
    data: status === "SENT" ? { status, sentAt: new Date() } : { status, reason: reason ?? null },
  });
  return status;
}

/** Kirim satu notice yang sudah tercatat (status SENDING). Dipakai langsung dan oleh cron. */
async function deliver(noticeId: string, project: ProjectForNotice, kind: ClientNoticeKind, extra: Partial<ClientNoticeData>) {
  const conversation = await prisma.waConversation.findFirst({
    where: { clientId: project.clientId, isSandbox: false, blockedAt: null },
    orderBy: { lastInboundAt: "desc" },
    select: { id: true },
  });
  if (!conversation) return finish(noticeId, "SKIPPED", "NO_CONVERSATION");
  const studio = await getStudioSettings();
  const text = clientNoticeText(kind, {
    clientName: project.clientName,
    serviceName: project.service.name,
    portalUrl: portalUrl(project),
    studioName: studio.name,
    ...extra,
  });
  const result = await sendSystemText(conversation.id, text);
  if (result.ok) return finish(noticeId, "SENT");
  return result.errorCode === "OUTSIDE_SERVICE_WINDOW"
    ? finish(noticeId, "SKIPPED", "OUTSIDE_SERVICE_WINDOW")
    : finish(noticeId, "FAILED", result.errorCode);
}

export async function notifyClientProjectEvent(projectId: string, event: ClientProjectEvent, now = new Date()): Promise<NoticeOutcome> {
  try {
    const project = await loadProject(projectId);
    if (!project) return "SKIPPED";
    const extra = await eventData(event);
    if (!extra) return "SKIPPED";
    const refId = refIdOf(event);

    if (event.kind === "PROGRESS") {
      const lastSent = await prisma.clientProjectNotice.findFirst({
        where: { projectId, event: "PROGRESS", status: "SENT" },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      });
      if (lastSent?.sentAt && now.getTime() - lastSent.sentAt.getTime() < PROGRESS_COOLDOWN_MS) {
        // Satu PENDING per project: update terbaru menggantikan yang lama.
        await prisma.clientProjectNotice.deleteMany({ where: { projectId, event: "PROGRESS", status: "PENDING" } });
        await prisma.clientProjectNotice.create({ data: { projectId, event: "PROGRESS", refId, status: "PENDING" } });
        return "PENDING";
      }
    }

    let notice: { id: string };
    try {
      notice = await prisma.clientProjectNotice.create({
        data: { projectId, event: event.kind, refId, status: "SENDING" },
        select: { id: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return "DUPLICATE";
      throw error;
    }
    return await deliver(notice.id, project, event.kind, extra);
  } catch (error) {
    console.error(`[kabar-klien] ${event.kind} gagal:`, (error as Error).name);
    return "FAILED";
  }
}

/** Kirim notice PENDING yang sudah diklaim (status SENDING) oleh cron. */
export async function sendNoticeNow(noticeId: string): Promise<NoticeOutcome> {
  try {
    const notice = await prisma.clientProjectNotice.findUnique({
      where: { id: noticeId },
      select: { id: true, projectId: true, event: true, refId: true },
    });
    if (!notice) return "SKIPPED";
    const project = await loadProject(notice.projectId);
    if (!project) return finish(notice.id, "SKIPPED", "PROJECT_GONE");
    const event: ClientProjectEvent =
      notice.event === "PROGRESS"
        ? { kind: "PROGRESS", updateId: notice.refId }
        : notice.event === "REVISION_DONE"
          ? { kind: "REVISION_DONE", revisionId: notice.refId }
          : ({ kind: notice.event } as ClientProjectEvent);
    const extra = await eventData(event);
    if (!extra) return finish(notice.id, "SKIPPED", "NOT_REQUESTED");
    return await deliver(notice.id, project, event.kind, extra);
  } catch (error) {
    console.error("[kabar-klien] kirim tertunda gagal:", (error as Error).name);
    return "FAILED";
  }
}
