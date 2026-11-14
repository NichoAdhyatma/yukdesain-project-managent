import { prisma } from "@/lib/db";
import { WA_OWNER, WA_TEMPLATES } from "@/lib/constants";
import { deliveryErrorCode, getChannel, isChannelConfigured, sendTemplateOnChannel, sendTextOnChannel, usesServiceWindow } from "../channel";
import { isWithinServiceWindow, templateParam } from "../outbound";
import { maskPhone } from "../phone";
import { listOwnerNumbers } from "./identity";

// Penyimpanan & pengiriman pertanyaan ke owner (docs/WHATSAPP_OWNER_COMMANDS.md §5). Terpisah dari
// queries.ts supaya tools klien tidak bergantung pada pipeline balasan bot (import melingkar).

export async function findPendingQuery(conversationId: string) {
  return prisma.waOwnerQuery.findFirst({
    where: { conversationId, status: "PENDING" },
    select: { id: true, question: true },
  });
}

export async function createOwnerQuery(p: { conversationId: string; intakeId: string | null; question: string }) {
  return prisma.waOwnerQuery.create({
    data: {
      conversationId: p.conversationId,
      intakeId: p.intakeId,
      question: p.question,
      expiresAt: new Date(Date.now() + WA_OWNER.queryTtlHours * 3_600_000),
    },
    select: { id: true },
  });
}

export function ownerQuestionText(p: { clientLabel: string; question: string }): string {
  return [
    "*Permintaan klien di luar katalog*",
    `Klien: ${p.clientLabel}`,
    `Permintaan: ${p.question}`,
    "",
    "*Reply* pesan ini dengan *BISA* atau *TIDAK* untuk permintaan di atas, boleh tambah catatan (mis. harga khusus atau layanan yang dipakai).",
  ].join("\n");
}

/**
 * Kirim pertanyaan ke semua nomor owner. Dalam 24 jam sejak owner terakhir chat ke bot → teks;
 * di luar itu → template yd_konfirmasi_owner. Return jumlah yang terkirim.
 */
export async function notifyOwners(queryId: string): Promise<number> {
  const query = await prisma.waOwnerQuery.findUniqueOrThrow({
    where: { id: queryId },
    select: {
      question: true,
      intakeId: true,
      conversation: { select: { waId: true, profileName: true } },
    },
  });
  const intake = query.intakeId
    ? await prisma.waIntake.findUnique({ where: { id: query.intakeId }, select: { clientName: true } })
    : null;
  const clientName = intake?.clientName ?? query.conversation.profileName ?? "Klien";
  const clientLabel = `${clientName} (${maskPhone(query.conversation.waId)})`;
  const text = ownerQuestionText({ clientLabel, question: query.question });

  const channel = await getChannel();
  const configured = isChannelConfigured(channel);

  let delivered = 0;
  for (const owner of await listOwnerNumbers()) {
    const conversation = await prisma.waConversation.upsert({
      where: { waId: owner.waNumber },
      create: { waId: owner.waNumber, profileName: owner.name },
      update: {},
      select: { id: true, lastInboundAt: true },
    });
    const via = !usesServiceWindow(channel) || isWithinServiceWindow(conversation.lastInboundAt) ? "text" : "template";
    const store = (data: { wamid?: string; deliveryStatus: string; errorCode?: string }) =>
      prisma.waMessage.create({
        data: {
          conversationId: conversation.id,
          direction: "OUTBOUND",
          type: via,
          body: via === "template" ? `[template ${WA_TEMPLATES.OWNER_QUERY}] ${text}` : text,
          sentByBot: true,
          ownerQueryId: queryId,
          ...data,
        },
      });

    if (!configured) {
      await store({ deliveryStatus: "failed", errorCode: "NOT_CONFIGURED" });
      continue;
    }
    try {
      const wamid =
        via === "text"
          ? await sendTextOnChannel(owner.waNumber, text, channel)
          : (
              await sendTemplateOnChannel(
                owner.waNumber,
                { name: WA_TEMPLATES.OWNER_QUERY, params: [templateParam(clientLabel), templateParam(query.question)] },
                text,
                channel,
              )
            ).id;
      await store({ wamid, deliveryStatus: "sent" });
      delivered++;
    } catch (error) {
      const errorCode = deliveryErrorCode(error);
      await store({ deliveryStatus: "failed", errorCode });
      console.error(`[whatsapp] pertanyaan owner gagal ke ${maskPhone(owner.waNumber)} via ${via}: ${errorCode}`);
    }
  }
  return delivered;
}

/** Pertanyaan yang dibalas (reply) owner, dari wamid pesan pertanyaan. */
export async function queryIdFromContext(contextWamid: string | null): Promise<string | null> {
  if (!contextWamid) return null;
  const message = await prisma.waMessage.findUnique({ where: { wamid: contextWamid }, select: { ownerQueryId: true } });
  return message?.ownerQueryId ?? null;
}

export async function answerOwnerQuery(
  queryId: string,
  p: { approved: boolean; note: string | null; answeredById: string },
): Promise<boolean> {
  const { count } = await prisma.waOwnerQuery.updateMany({
    where: { id: queryId, status: "PENDING" },
    data: { status: "ANSWERED", approved: p.approved, note: p.note, answeredById: p.answeredById, answeredAt: new Date() },
  });
  return count === 1;
}

