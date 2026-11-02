import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { updateBriefDraft } from "@/lib/whatsapp/intake";
import {
  errorResponse,
  findIntakeForDetail,
  intakeErrorResponse,
  logIntakeActivity,
  parseBody,
  toDetail,
} from "@/lib/whatsapp/intake-api";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;

  const row = await findIntakeForDetail(id);
  if (!row) return errorResponse("NOT_FOUND", "Order WA tidak ditemukan");
  return NextResponse.json(await toDetail(row));
}

// Edit brief draft oleh admin, hanya sebelum APPROVED (§12.3). Validasi field per layanan.
const patchSchema = z.object({ briefDraft: z.record(z.string(), z.unknown()) });

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = await parseBody(request, patchSchema);
  if (body.error) return body.error;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await updateBriefDraft(tx, { intakeId: id, fields: body.data.briefDraft, source: "ADMIN" });
      await logIntakeActivity(tx, {
        intakeId: id,
        actorId: auth.user.id,
        action: "WA_BRIEF_EDITED",
        newValue: { fields: Object.keys(body.data.briefDraft) },
      });
      return updated;
    });
    const row = await findIntakeForDetail(id);
    return NextResponse.json({ ...result, intake: row ? await toDetail(row) : null });
  } catch (error) {
    return intakeErrorResponse(error);
  }
}
