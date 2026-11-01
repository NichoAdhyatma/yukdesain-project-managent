import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { InboundMessage, StatusUpdate } from "./payload";

// Urutan status Meta bisa datang tidak berurutan; status tidak boleh mundur
// (mis. "read" tertimpa "delivered"). "failed" selalu dicatat.
const STATUS_ORDER = ["sent", "delivered", "read"];

export async function applyStatusUpdate(update: StatusUpdate): Promise<void> {
  const rank = STATUS_ORDER.indexOf(update.status);
  const lower = rank > 0 ? STATUS_ORDER.slice(0, rank) : [];
  const where: Prisma.WaMessageWhereInput =
    update.status === "failed" || rank === -1
      ? { wamid: update.wamid }
      : { wamid: update.wamid, OR: [{ deliveryStatus: null }, { deliveryStatus: { in: lower } }] };

  await prisma.waMessage.updateMany({
    where,
    data: { deliveryStatus: update.status, ...(update.errorCode ? { errorCode: update.errorCode } : {}) },
  });
}

/**
 * Simpan pesan masuk. Return id WaMessage, atau null jika wamid sudah pernah
 * disimpan (Meta mengirim ulang webhook yang sama).
 */
export async function storeInboundMessage(msg: InboundMessage): Promise<string | null> {
  // Pengiriman ulang dari Meta itu umum; cek dulu supaya tidak memicu log prisma:error.
  // Constraint unik wamid tetap jadi pengaman untuk webhook yang datang bersamaan.
  const existing = await prisma.waMessage.findUnique({ where: { wamid: msg.wamid }, select: { id: true } });
  if (existing) return null;

  const conversation = await prisma.waConversation.upsert({
    where: { waId: msg.waId },
    create: { waId: msg.waId, profileName: msg.profileName, lastInboundAt: msg.sentAt },
    update: msg.profileName ? { profileName: msg.profileName } : {},
    select: { id: true },
  });

  // lastInboundAt hanya maju — penentu jendela 24 jam (§5.2)
  await prisma.waConversation.updateMany({
    where: {
      id: conversation.id,
      OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: msg.sentAt } }],
    },
    data: { lastInboundAt: msg.sentAt },
  });

  const content =
    msg.type === "text"
      ? { type: "text", body: msg.body }
      : msg.type === "image"
        ? { type: "image", body: msg.caption ?? "", mediaId: msg.mediaId, mediaSha256: msg.sha256 }
        : { type: "unsupported", body: "" };

  try {
    const created = await prisma.waMessage.create({
      data: {
        conversationId: conversation.id,
        wamid: msg.wamid,
        direction: "INBOUND",
        ...content,
      },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return null;
    }
    throw error;
  }
}
