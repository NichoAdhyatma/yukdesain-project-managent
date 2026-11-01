import { NextResponse } from "next/server";
import type { Prisma, WaIntakeStatus } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { briefResponsesToEntries } from "@/lib/brief/responses";
import { IntakeError, type IntakeErrorCode } from "./intake";
import { isWithinServiceWindow } from "./outbound";
import { getPrivateMediaUrl } from "./media";
import { maskPhone } from "./phone";
import { getAppPublicUrl } from "./env";

// Bagian bersama route /api/wa-intakes/* (owner). DTO dibangun eksplisit (AGENTS.md §36).

const STATUS_BY_CODE: Record<IntakeErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
};

export function errorResponse(code: IntakeErrorCode | "INTERNAL_SERVER_ERROR", message: string, details?: unknown) {
  const status = code === "INTERNAL_SERVER_ERROR" ? 500 : STATUS_BY_CODE[code];
  return NextResponse.json({ error: code, message, ...(details ? { details } : {}) }, { status });
}

/** IntakeError → respons HTTP; error lain dilempar ulang. */
export function intakeErrorResponse(error: unknown) {
  if (error instanceof IntakeError) return errorResponse(error.code, error.message, error.details);
  throw error;
}

export async function parseBody<T extends z.ZodType>(request: Request, schema: T) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (parsed.success) return { data: parsed.data as z.infer<T> };
  const fields = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join(".") || "body", i.message]));
  return { error: errorResponse("VALIDATION_ERROR", "Input tidak valid", { fields }) };
}

export function logIntakeActivity(
  db: Prisma.TransactionClient,
  p: { intakeId: string; actorId: string; action: string; previousValue?: unknown; newValue?: unknown },
) {
  return db.activityLog.create({
    data: {
      entityType: "WaIntake",
      entityId: p.intakeId,
      action: p.action,
      actorId: p.actorId,
      previousValue: (p.previousValue ?? undefined) as Prisma.InputJsonValue | undefined,
      newValue: (p.newValue ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

// ---- List ----

export const listInclude = {
  conversation: { select: { waId: true, profileName: true, lastInboundAt: true, mode: true } },
  service: { select: { code: true, name: true } },
  _count: { select: { paymentProofs: { where: { status: "PENDING" } } } },
} satisfies Prisma.WaIntakeInclude;

type ListRow = Prisma.WaIntakeGetPayload<{ include: typeof listInclude }>;

export function toListItem(row: ListRow) {
  return {
    id: row.id,
    status: row.status,
    clientName: row.clientName ?? row.conversation.profileName,
    phoneMasked: maskPhone(row.conversation.waId),
    service: row.service,
    agreedPrice: row.agreedPrice,
    dpAmount: row.dpAmount,
    deadline: row.deadline,
    pendingProofs: row._count.paymentProofs,
    conversationMode: row.conversation.mode,
    // Pesan berikutnya ke klien akan memakai template (§12.1)
    outsideServiceWindow: !isWithinServiceWindow(row.conversation.lastInboundAt),
    updatedAt: row.updatedAt,
  };
}

// ---- Detail ----

export const detailInclude = {
  conversation: {
    select: {
      id: true,
      waId: true,
      profileName: true,
      mode: true,
      lastInboundAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          direction: true,
          type: true,
          body: true,
          mediaStorageKey: true,
          sentByBot: true,
          deliveryStatus: true,
          errorCode: true,
          createdAt: true,
        },
      },
    },
  },
  service: { select: { id: true, code: true, name: true } },
  paymentProofs: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      storageKey: true,
      aiExtraction: true,
      aiFlags: true,
      status: true,
      verifiedAmount: true,
      rejectReason: true,
      reviewedAt: true,
      createdAt: true,
    },
  },
} satisfies Prisma.WaIntakeInclude;

type DetailRow = Prisma.WaIntakeGetPayload<{ include: typeof detailInclude }>;

async function signedUrl(key: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    return await getPrivateMediaUrl(key);
  } catch {
    return null; // storage belum dikonfigurasi
  }
}

export async function toDetail(row: DetailRow) {
  const { conversation } = row;
  const messages = await Promise.all(
    [...conversation.messages].reverse().map(async (m) => ({
      id: m.id,
      direction: m.direction,
      type: m.type,
      body: m.body,
      imageUrl: m.type === "image" ? await signedUrl(m.mediaStorageKey) : null,
      sentByBot: m.sentByBot,
      deliveryStatus: m.deliveryStatus,
      errorCode: m.errorCode,
      createdAt: m.createdAt,
    })),
  );
  const proofs = await Promise.all(
    row.paymentProofs.map(async (p) => ({
      id: p.id,
      imageUrl: await signedUrl(p.storageKey),
      extraction: p.aiExtraction,
      flags: p.aiFlags,
      status: p.status,
      verifiedAmount: p.verifiedAmount,
      rejectReason: p.rejectReason,
      reviewedAt: p.reviewedAt,
      createdAt: p.createdAt,
    })),
  );
  const draft = (row.briefDraft ?? {}) as Record<string, unknown>;

  return {
    id: row.id,
    status: row.status as WaIntakeStatus,
    service: row.service,
    clientName: row.clientName,
    clientEmail: row.clientEmail,
    brief: {
      draft,
      // Format sama dengan Brief.responses → bisa langsung dirender BriefReader
      responses: briefResponsesToEntries(draft),
      summary: row.briefSummary,
      confirmedAt: row.briefConfirmedAt,
      editedByAdmin: row.briefEditedByAdmin,
    },
    quote: {
      agreedPrice: row.agreedPrice,
      dpAmount: row.dpAmount,
      deadline: row.deadline,
      quotedAt: row.quotedAt,
    },
    cancelReason: row.cancelReason,
    projectId: row.projectId,
    conversation: {
      id: conversation.id,
      // Nomor lengkap untuk owner (menghubungi klien manual saat pesan gagal)
      waId: conversation.waId,
      profileName: conversation.profileName,
      mode: conversation.mode,
      lastInboundAt: conversation.lastInboundAt,
      outsideServiceWindow: !isWithinServiceWindow(conversation.lastInboundAt),
    },
    messages,
    proofs,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findIntakeForDetail(id: string) {
  return prisma.waIntake.findUnique({ where: { id }, include: detailInclude });
}

/** URL publik link tracking klien: APP_PUBLIC_URL, atau Origin request owner. */
export function trackingUrl(request: Request, token: string): string {
  const base = getAppPublicUrl() ?? request.headers.get("origin") ?? new URL(request.url).origin;
  return `${base.replace(/\/+$/, "")}/client/${token}`;
}
