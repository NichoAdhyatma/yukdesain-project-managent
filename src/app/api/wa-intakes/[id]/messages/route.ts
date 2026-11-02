import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { MANUAL_REPLY_MAX_LENGTH, isWithinServiceWindow, sendManualReply } from "@/lib/whatsapp/outbound";
import {
  REAL_INTAKE,
  errorResponse,
  findIntakeForDetail,
  logIntakeActivity,
  parseBody,
  toDetail,
} from "@/lib/whatsapp/intake-api";

type Params = { params: Promise<{ id: string }> };

const messageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Pesan tidak boleh kosong")
    .max(MANUAL_REPLY_MAX_LENGTH, `Maksimal ${MANUAL_REPLY_MAX_LENGTH} karakter`),
});

// POST: balasan manual admin ke klien dari nomor bot. Hanya saat mode HUMAN (bot diam)
// dan masih di dalam jendela 24 jam; di luar itu Meta hanya menerima template.
export async function POST(request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = await parseBody(request, messageSchema);
  if (body.error) return body.error;

  const intake = await prisma.waIntake.findFirst({
    where: { id, ...REAL_INTAKE },
    select: { conversation: { select: { id: true, waId: true, mode: true, lastInboundAt: true } } },
  });
  if (!intake) return errorResponse("NOT_FOUND", "Order WA tidak ditemukan");
  const { conversation } = intake;

  if (conversation.mode !== "HUMAN") {
    return errorResponse("CONFLICT", "Chat masih dilayani bot. Ambil alih dulu sebelum membalas.");
  }
  if (!isWithinServiceWindow(conversation.lastInboundAt)) {
    return errorResponse(
      "UNPROCESSABLE_ENTITY",
      "Sudah lewat 24 jam sejak pesan terakhir klien. WhatsApp hanya mengizinkan template, jadi balasan manual tidak bisa dikirim.",
    );
  }

  const delivery = await sendManualReply(conversation, body.data.text, auth.user.id);
  // Isi pesan sudah ada di WaMessage; log hanya mencatat siapa mengirim dan hasilnya.
  await logIntakeActivity(prisma, {
    intakeId: id,
    actorId: auth.user.id,
    action: "WA_MANUAL_REPLY",
    newValue: { messageId: delivery.messageId, ok: delivery.ok, ...(delivery.ok ? {} : { errorCode: delivery.errorCode }) },
  });

  const row = await findIntakeForDetail(id);
  return NextResponse.json({ intake: row ? await toDetail(row) : null, delivery });
}
