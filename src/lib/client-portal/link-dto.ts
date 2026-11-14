import type { Prisma } from "@prisma/client";
import type { BriefResponses } from "@/components/forms/brief/types";

// Response GET /api/client-links/[token] (portal klien publik, AGENTS.md §20, §26, §36).
// Field dipilih eksplisit di query DAN di DTO: notes, ownerId, data client, freelancerPayout,
// detail assignment, payments, dan ID internal yang tidak dipakai portal tidak pernah keluar,
// walau query diubah jadi `include` atau baris DB berisi kolom tambahan.

const attachmentSelect = { id: true, filename: true, storageKey: true } satisfies Prisma.AttachmentSelect;

export const clientLinkSelect = {
  id: true,
  status: true,
  expiresAt: true,
  project: {
    select: {
      id: true,
      projectNumber: true,
      clientName: true,
      deadline: true,
      status: true,
      agreedPrice: true,
      paidAmount: true,
      paymentStatus: true,
      finalSubmittedAt: true,
      finalDelivery: true,
      finalLink: true,
      finalApprovedAt: true,
      revisionQuota: true,
      service: { select: { code: true, name: true } },
      brief: { select: { submittedAt: true, responses: true } },
      invoices: {
        orderBy: { issuedAt: "desc" },
        take: 1,
        select: {
          invoiceNumber: true,
          items: true,
          subtotal: true,
          total: true,
          status: true,
          issuedAt: true,
        },
      },
      assignments: {
        take: 1,
        select: { assignedAt: true, designer: { select: { name: true } } },
      },
      updates: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          progress: true,
          description: true,
          createdAt: true,
          author: { select: { name: true } },
          attachment: { select: attachmentSelect },
        },
      },
      // File hasil akhir (kategori FINAL, dikirim desainer lewat hasil akhir); key hanya keluar setelah lunas.
      attachments: {
        where: { category: "FINAL" },
        orderBy: { createdAt: "asc" },
        select: attachmentSelect,
      },
      revisions: {
        orderBy: { requestedAt: "desc" },
        select: {
          id: true,
          number: true,
          status: true,
          description: true,
          requestedAt: true,
          completedAt: true,
          attachments: { select: attachmentSelect },
        },
      },
    },
  },
} satisfies Prisma.ClientLinkSelect;

export const clientPaymentAccountSelect = {
  id: true,
  type: true,
  name: true,
  accountNumber: true,
  accountHolder: true,
  logoUrl: true,
  qrisImageUrl: true,
} satisfies Prisma.PaymentAccountSelect;

type ClientLinkRow = Prisma.ClientLinkGetPayload<{ select: typeof clientLinkSelect }>;
type PaymentAccountRow = Prisma.PaymentAccountGetPayload<{ select: typeof clientPaymentAccountSelect }>;

export type ClientAttachmentDto = { id: string; filename: string; storageKey: string };

/** File final: nama selalu terlihat; storageKey null selama belum lunas (2026-11-12). */
export type ClientFinalFilesDto = {
  locked: boolean;
  /** Cara kirim hasil akhir (2026-11-14): file di portal, link Drive, atau lewat WhatsApp */
  method: "FILE" | "LINK" | "WHATSAPP";
  /** Link file final; null selama belum lunas */
  link: string | null;
  files: Array<{ id: string; filename: string; storageKey: string | null }>;
};

export type ClientInvoiceItemDto = { description: string; quantity: number; unitPrice: number; total: number };

export type ClientProjectDto = {
  /** Dipakai portal sebagai `projectId` saat upload file klien. */
  id: string;
  projectNumber: string;
  clientName: string;
  deadline: string;
  status: string;
  agreedPrice: number;
  paidAmount: number;
  paymentStatus: string;
  finalSubmittedAt: string | null;
  finalApprovedAt: string | null;
  /** Kuota revisi gratis project ini (snapshot Operasional studio) */
  revisionQuota: number;
  service: { code: string; name: string };
  brief: { submittedAt: string; responses: BriefResponses } | null;
  invoices: Array<{
    invoiceNumber: string;
    items: ClientInvoiceItemDto[];
    subtotal: number;
    total: number;
    status: string;
    issuedAt: string;
  }>;
  assignedDesigner: { name: string; assignedAt: string } | null;
  updates: Array<{
    id: string;
    progress: number | null;
    description: string;
    createdAt: string;
    author: { name: string };
    attachment: ClientAttachmentDto | null;
  }>;
  revisions: Array<{
    id: string;
    number: number;
    status: string;
    description: string;
    requestedAt: string;
    /** Desainer menandai revisi selesai dikerjakan */
    completedAt: string | null;
    attachments: ClientAttachmentDto[];
  }>;
  finalFiles: ClientFinalFilesDto;
  /** Dibuka akun staf non-owner (desainer): invoice, harga, dan pembayaran tidak dikirim (keputusan owner 2026-11-13). */
  financeHidden: boolean;
};

export type ClientLinkDto = { status: string; project: ClientProjectDto };

export type ClientPaymentAccountDto = {
  id: string;
  type: string;
  name: string;
  accountNumber: string;
  accountHolder: string;
  logoUrl: string;
  qrisImageUrl: string;
};

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

function toAttachment(a: ClientAttachmentDto): ClientAttachmentDto {
  return { id: a.id, filename: a.filename, storageKey: a.storageKey };
}

/**
 * File final terkunci sampai lunas: tanpa storageKey, supaya URL file tidak pernah sampai ke klien sebelum lunas.
 * Link Drive (cara kirim LINK) mengikuti aturan yang sama.
 */
export function toFinalFiles(
  files: ClientAttachmentDto[],
  paymentStatus: string,
  delivery: string | null,
  finalLink: string | null,
): ClientFinalFilesDto {
  const locked = paymentStatus !== "PAID";
  const method = delivery === "LINK" || delivery === "WHATSAPP" ? delivery : "FILE";
  return {
    locked,
    method,
    link: method === "LINK" && !locked ? finalLink : null,
    files: files.map((f) => ({ id: f.id, filename: f.filename, storageKey: locked ? null : f.storageKey })),
  };
}

function toInvoiceItems(items: Prisma.JsonValue): ClientInvoiceItemDto[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    return {
      description: String(item.description ?? ""),
      quantity: Number(item.quantity ?? 0),
      unitPrice: Number(item.unitPrice ?? 0),
      total: Number(item.total ?? 0),
    };
  });
}

export function toClientLinkDto(link: ClientLinkRow): ClientLinkDto {
  const p = link.project;
  const assignment = p.assignments[0];
  return {
    status: link.status,
    project: {
      id: p.id,
      projectNumber: p.projectNumber,
      clientName: p.clientName,
      deadline: iso(p.deadline),
      status: p.status,
      agreedPrice: p.agreedPrice,
      paidAmount: p.paidAmount,
      paymentStatus: p.paymentStatus,
      finalSubmittedAt: isoOrNull(p.finalSubmittedAt),
      finalApprovedAt: isoOrNull(p.finalApprovedAt),
      revisionQuota: p.revisionQuota,
      service: { code: p.service.code, name: p.service.name },
      brief: p.brief
        ? { submittedAt: iso(p.brief.submittedAt), responses: p.brief.responses as unknown as BriefResponses }
        : null,
      invoices: p.invoices.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        items: toInvoiceItems(inv.items),
        subtotal: inv.subtotal,
        total: inv.total,
        status: inv.status,
        issuedAt: iso(inv.issuedAt),
      })),
      assignedDesigner: assignment
        ? { name: assignment.designer.name, assignedAt: iso(assignment.assignedAt) }
        : null,
      updates: p.updates.map((u) => ({
        id: u.id,
        progress: u.progress,
        description: u.description,
        createdAt: iso(u.createdAt),
        author: { name: u.author.name },
        attachment: u.attachment ? toAttachment(u.attachment) : null,
      })),
      revisions: p.revisions.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        description: r.description,
        requestedAt: iso(r.requestedAt),
        completedAt: isoOrNull(r.completedAt),
        attachments: r.attachments.map(toAttachment),
      })),
      finalFiles: toFinalFiles(p.attachments, p.paymentStatus, p.finalDelivery, p.finalLink),
      financeHidden: false,
    },
  };
}

/**
 * Portal yang dibuka desainer (akun login tanpa peran OWNER): data keuangan dikosongkan di server, bukan hanya
 * disembunyikan di tampilan. Owner 2026-11-13: karyawan melihat invoice lewat "Lacak pesanan".
 */
export function withoutFinance(dto: ClientLinkDto): ClientLinkDto {
  return {
    ...dto,
    project: {
      ...dto.project,
      agreedPrice: 0,
      paidAmount: 0,
      paymentStatus: "",
      invoices: [],
      financeHidden: true,
    },
  };
}

export function toClientPaymentAccountDto(a: PaymentAccountRow): ClientPaymentAccountDto {
  return {
    id: a.id,
    type: a.type,
    name: a.name,
    accountNumber: a.accountNumber,
    accountHolder: a.accountHolder,
    logoUrl: a.logoUrl,
    qrisImageUrl: a.qrisImageUrl,
  };
}
