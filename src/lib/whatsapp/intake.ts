import type { Prisma, WaIntakeStatus } from "@prisma/client";
import { DP_PERCENT } from "@/lib/constants";
import { mergeBriefDraft, missingRequiredFields, validateBriefFields, type BriefDraft } from "./ai/brief-schema";

// State machine WaIntake (docs/WHATSAPP_AI_CHATBOT.md §3.2). Semua transisi dicek di
// server; perubahan status selalu memakai status lama di `where` supaya klik ganda
// atau pesan bersamaan tidak memproses dua kali.

type Db = Prisma.TransactionClient;

export type IntakeActor = "AI" | "ADMIN";

export type IntakeAction =
  | "confirm_brief"
  | "reopen_brief"
  | "quote"
  | "submit_proof"
  | "reject_proof"
  | "approve"
  | "cancel";

type Transition = { action: IntakeAction; from: WaIntakeStatus[]; to: WaIntakeStatus; by: IntakeActor };

export const INTAKE_TRANSITIONS: Transition[] = [
  { action: "confirm_brief", from: ["COLLECTING"], to: "AWAITING_QUOTE", by: "AI" },
  { action: "reopen_brief", from: ["AWAITING_QUOTE"], to: "COLLECTING", by: "AI" },
  // QUOTED → QUOTED: admin merevisi harga/deadline dan penawaran dikirim ulang
  { action: "quote", from: ["AWAITING_QUOTE", "QUOTED"], to: "QUOTED", by: "ADMIN" },
  { action: "submit_proof", from: ["QUOTED"], to: "DP_REVIEW", by: "AI" },
  { action: "reject_proof", from: ["DP_REVIEW"], to: "QUOTED", by: "ADMIN" },
  { action: "approve", from: ["DP_REVIEW"], to: "APPROVED", by: "ADMIN" },
  // AI hanya boleh membatalkan sebelum bukti transfer masuk
  { action: "cancel", from: ["COLLECTING", "AWAITING_QUOTE", "QUOTED"], to: "CANCELLED", by: "AI" },
  { action: "cancel", from: ["COLLECTING", "AWAITING_QUOTE", "QUOTED", "DP_REVIEW"], to: "CANCELLED", by: "ADMIN" },
];

export const ACTIVE_INTAKE_STATUSES: WaIntakeStatus[] = ["COLLECTING", "AWAITING_QUOTE", "QUOTED", "DP_REVIEW"];

export type IntakeErrorCode = "CONFLICT" | "NOT_FOUND" | "VALIDATION_ERROR" | "UNPROCESSABLE_ENTITY";

export class IntakeError extends Error {
  constructor(
    readonly code: IntakeErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "IntakeError";
  }
}

/** Status tujuan, atau null jika transisi tidak diizinkan. */
export function nextStatus(from: WaIntakeStatus, action: IntakeAction, actor: IntakeActor): WaIntakeStatus | null {
  const rule = INTAKE_TRANSITIONS.find((t) => t.action === action && t.by === actor && t.from.includes(from));
  return rule?.to ?? null;
}

export function computeDpAmount(agreedPrice: number): number {
  return Math.ceil((agreedPrice * DP_PERCENT) / 100);
}

/**
 * Jalankan transisi dengan kunci optimistik: update hanya jika status masih `from`.
 * count 0 → CONFLICT (status sudah berubah oleh proses lain).
 */
export async function transitionIntake(
  db: Db,
  params: {
    intakeId: string;
    from: WaIntakeStatus;
    action: IntakeAction;
    actor: IntakeActor;
    data?: Omit<Prisma.WaIntakeUpdateManyMutationInput, "status">;
    // Kunci tambahan untuk read-modify-write (mis. merge briefDraft)
    expectedUpdatedAt?: Date;
  },
): Promise<WaIntakeStatus> {
  const to = nextStatus(params.from, params.action, params.actor);
  if (!to) {
    throw new IntakeError("CONFLICT", `Aksi ${params.action} tidak diizinkan dari status ${params.from}`, {
      from: params.from,
      action: params.action,
    });
  }
  const { count } = await db.waIntake.updateMany({
    where: {
      id: params.intakeId,
      status: params.from,
      ...(params.expectedUpdatedAt ? { updatedAt: params.expectedUpdatedAt } : {}),
    },
    data: { ...params.data, status: to },
  });
  if (count === 0) {
    throw new IntakeError("CONFLICT", "Status intake sudah berubah", { from: params.from, action: params.action });
  }
  return to;
}

async function loadIntake(db: Db, intakeId: string) {
  const intake = await db.waIntake.findUnique({
    where: { id: intakeId },
    select: { id: true, status: true, briefDraft: true, updatedAt: true, service: { select: { code: true } } },
  });
  if (!intake) throw new IntakeError("NOT_FOUND", "Intake tidak ditemukan");
  return intake;
}

export type BriefUpdateSource = "AI" | "ADMIN";

/**
 * Gabungkan field ke briefDraft. Dari AWAITING_QUOTE, brief yang berubah wajib
 * dikonfirmasi ulang → kembali ke COLLECTING. QUOTED/DP_REVIEW ditolak (arahkan
 * ke admin). Return status baru + field wajib yang masih kosong.
 */
export async function updateBriefDraft(
  db: Db,
  params: { intakeId: string; fields: unknown; source: BriefUpdateSource },
): Promise<{ status: WaIntakeStatus; missingRequired: string[] }> {
  const intake = await loadIntake(db, params.intakeId);
  const serviceCode = intake.service?.code;
  if (!serviceCode) throw new IntakeError("UNPROCESSABLE_ENTITY", "Layanan belum dipilih");

  // Admin boleh mengedit brief sampai sebelum APPROVED (§12.3); AI hanya sebelum ada harga.
  const editable: WaIntakeStatus[] =
    params.source === "ADMIN" ? ACTIVE_INTAKE_STATUSES : ["COLLECTING", "AWAITING_QUOTE"];
  if (!editable.includes(intake.status)) {
    throw new IntakeError("CONFLICT", `Brief tidak bisa diubah pada status ${intake.status}`, { status: intake.status });
  }

  const validation = validateBriefFields(serviceCode, params.fields, params.source);
  if (!validation.ok) {
    throw new IntakeError("VALIDATION_ERROR", validation.error, { invalidKeys: validation.invalidKeys });
  }

  const merged = mergeBriefDraft(intake.briefDraft as BriefDraft, validation.data);
  const reopen = params.source === "AI" && intake.status === "AWAITING_QUOTE";
  const data: Prisma.WaIntakeUpdateManyMutationInput = {
    briefDraft: merged as Prisma.InputJsonValue,
    ...(params.source === "ADMIN" ? { briefEditedByAdmin: true } : {}),
    ...(reopen ? { briefSummary: null, briefConfirmedAt: null } : {}),
  };

  let status = intake.status;
  if (reopen) {
    status = await transitionIntake(db, {
      intakeId: intake.id,
      from: intake.status,
      action: "reopen_brief",
      actor: "AI",
      data,
      expectedUpdatedAt: intake.updatedAt,
    });
  } else {
    const { count } = await db.waIntake.updateMany({
      where: { id: intake.id, status: intake.status, updatedAt: intake.updatedAt },
      data,
    });
    if (count === 0) throw new IntakeError("CONFLICT", "Status intake sudah berubah");
  }

  return { status, missingRequired: missingRequiredFields(serviceCode, merged) };
}

/** COLLECTING → AWAITING_QUOTE. Ditolak jika masih ada field wajib yang kosong. */
export async function confirmBrief(
  db: Db,
  params: { intakeId: string; summary: string },
): Promise<WaIntakeStatus> {
  const intake = await loadIntake(db, params.intakeId);
  const serviceCode = intake.service?.code;
  if (!serviceCode) throw new IntakeError("UNPROCESSABLE_ENTITY", "Layanan belum dipilih");

  const summary = params.summary.trim();
  if (!summary) throw new IntakeError("VALIDATION_ERROR", "Ringkasan brief wajib diisi");

  const missing = missingRequiredFields(serviceCode, intake.briefDraft as BriefDraft);
  if (missing.length) {
    throw new IntakeError("UNPROCESSABLE_ENTITY", "Masih ada field wajib yang kosong", { missingRequired: missing });
  }

  return transitionIntake(db, {
    intakeId: intake.id,
    from: intake.status,
    action: "confirm_brief",
    actor: "AI",
    data: { briefSummary: summary, briefConfirmedAt: new Date() },
    // Field wajib dicek dari draft yang dibaca; jangan konfirmasi jika draft berubah sejak itu.
    expectedUpdatedAt: intake.updatedAt,
  });
}
