import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { revisionQuotaRemaining } from "@/lib/revisions/quota";
import { getAppPublicUrl } from "../env";

// Data project untuk klien lewat bot (§14). Field dipilih eksplisit di query DAN di DTO,
// sehingga notes, freelancerPayout, data designer, ActivityLog, ownerId, ID internal,
// dan data klien lain tidak pernah terbaca, apalagi dikirim ke model.

const DEFAULT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Menunggu brief",
  BELUM_DIKERJAKAN: "Belum dikerjakan",
  SEDANG_DIKERJAKAN: "Sedang dikerjakan",
  SELESAI: "Selesai",
};

async function statusLabels(): Promise<Record<string, string>> {
  const rows = await prisma.statusLabel.findMany({ where: { type: "PROJECT" }, select: { value: true, label: true } });
  return { ...DEFAULT_STATUS_LABELS, ...Object.fromEntries(rows.map((r) => [r.value, r.label])) };
}

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const summarySelect = {
  projectNumber: true,
  status: true,
  deadline: true,
  service: { select: { name: true } },
} satisfies Prisma.ProjectSelect;

export type ProjectSummaryDto = {
  projectNumber: string;
  serviceName: string;
  statusLabel: string;
  deadline: string | null;
};

function toSummary(p: Prisma.ProjectGetPayload<{ select: typeof summarySelect }>, labels: Record<string, string>): ProjectSummaryDto {
  return {
    projectNumber: p.projectNumber,
    serviceName: p.service.name,
    statusLabel: labels[p.status] ?? p.status,
    deadline: isoDate(p.deadline),
  };
}

/** Maksimal 5 project terbaru milik klien. */
export async function getClientProjectSummaries(clientId: string): Promise<ProjectSummaryDto[]> {
  const [rows, labels] = await Promise.all([
    prisma.project.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: summarySelect,
    }),
    statusLabels(),
  ]);
  return rows.map((r) => toSummary(r, labels));
}

const detailSelect = {
  ...summarySelect,
  agreedPrice: true,
  paidAmount: true,
  paymentStatus: true,
  finalSubmittedAt: true,
  finalApprovedAt: true,
  brief: { select: { id: true } },
  updates: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { progress: true, description: true, createdAt: true },
  },
  _count: { select: { revisions: true } },
  invoices: { orderBy: { issuedAt: "desc" }, take: 1, select: { invoiceNumber: true, total: true, status: true } },
  clientLinks: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1, select: { token: true } },
} satisfies Prisma.ProjectSelect;

export type ProjectDetailDto = ProjectSummaryDto & {
  progress: { percent: number | null; note: string; updatedAt: string } | null;
  briefSubmitted: boolean;
  revisionCount: number;
  revisionQuotaRemaining: number;
  finalSubmitted: boolean;
  finalApproved: boolean;
  invoice: { invoiceNumber: string; total: number; remaining: number; paymentStatus: string } | null;
  portalUrl: string | null;
};

function toDetail(p: Prisma.ProjectGetPayload<{ select: typeof detailSelect }>, labels: Record<string, string>): ProjectDetailDto {
  const update = p.updates[0];
  const invoice = p.invoices[0];
  const token = p.clientLinks[0]?.token;
  const base = getAppPublicUrl();
  return {
    ...toSummary(p, labels),
    progress: update
      ? { percent: update.progress, note: update.description.slice(0, 300), updatedAt: isoDate(update.createdAt)! }
      : null,
    briefSubmitted: !!p.brief,
    revisionCount: p._count.revisions,
    revisionQuotaRemaining: revisionQuotaRemaining(p._count.revisions),
    finalSubmitted: !!p.finalSubmittedAt,
    finalApproved: !!p.finalApprovedAt,
    // Invoice hanya saat project selesai (§14)
    invoice:
      p.status === "SELESAI" && invoice
        ? {
            invoiceNumber: invoice.invoiceNumber,
            total: invoice.total,
            remaining: Math.max(0, p.agreedPrice - p.paidAmount),
            paymentStatus: p.paymentStatus,
          }
        : null,
    portalUrl: token && base ? `${base}/client/${token}` : null,
  };
}

/** Kode project bersifat rahasia (sama dengan /api/portal/lookup). Null jika tidak ada. */
export async function getProjectDetailByCode(code: string): Promise<ProjectDetailDto | null> {
  const projectNumber = code.trim().toUpperCase();
  if (!projectNumber) return null;
  const [row, labels] = await Promise.all([
    prisma.project.findUnique({ where: { projectNumber }, select: detailSelect }),
    statusLabels(),
  ]);
  return row ? toDetail(row, labels) : null;
}
