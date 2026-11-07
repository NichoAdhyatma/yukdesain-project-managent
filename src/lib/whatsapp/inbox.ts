import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getChannel, usesServiceWindow } from "./channel";
import { ownerNumberSet } from "./intake-api";
import { getPrivateMediaUrl } from "./media";
import { isWithinServiceWindow } from "./outbound";
import { maskPhone } from "./phone";
import { isPhoneReplyWamid } from "./phone-takeover";

// Inbox semua chat WhatsApp (docs/OWNER_NOTIFICATIONS_INBOX.md §3). Hanya percakapan sungguhan (bukan Uji bot).

export const INBOX_FILTERS = ["all", "needs_admin", "no_order", "blocked"] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export const inboxQuerySchema = z.object({
  filter: z.enum(INBOX_FILTERS).default("all"),
  q: z.string().trim().max(60).default(""),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(30),
});

const REAL_CONVERSATION = { isSandbox: false } satisfies Prisma.WaConversationWhereInput;

function filterWhere(filter: InboxFilter): Prisma.WaConversationWhereInput {
  switch (filter) {
    case "needs_admin":
      return { mode: "HUMAN", blockedAt: null };
    case "no_order":
      return { intakes: { none: {} }, blockedAt: null };
    case "blocked":
      return { blockedAt: { not: null } };
    default:
      return {};
  }
}

function searchWhere(q: string): Prisma.WaConversationWhereInput {
  if (!q) return {};
  const digits = q.replace(/\D/g, "");
  return {
    OR: [
      { profileName: { contains: q, mode: "insensitive" } },
      { intakes: { some: { clientName: { contains: q, mode: "insensitive" } } } },
      // Nomor: cocokkan digit (0812… dan 62812… sama-sama ketemu)
      ...(digits.length >= 4 ? [{ waId: { contains: digits.replace(/^0/, "") } }] : []),
    ],
  };
}

async function signedUrl(key: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    return await getPrivateMediaUrl(key);
  } catch {
    return null; // storage belum dikonfigurasi
  }
}

const PREVIEW_CHARS = 90;

const preview = (m: { type: string; body: string } | undefined) => {
  if (!m) return "";
  if (m.type === "image") return m.body ? `Gambar: ${m.body}` : "Gambar";
  if (m.type === "unsupported") return "Pesan jenis lain (suara/video/dokumen)";
  return m.body.length > PREVIEW_CHARS ? `${m.body.slice(0, PREVIEW_CHARS - 1)}…` : m.body;
};

export async function listInbox(input: z.infer<typeof inboxQuerySchema>) {
  const where: Prisma.WaConversationWhereInput = { ...REAL_CONVERSATION, ...filterWhere(input.filter), ...searchWhere(input.q) };
  const [rows, total, needsAdmin, ownerNumbers, serviceWindow] = await Promise.all([
    prisma.waConversation.findMany({
      where,
      orderBy: [{ lastInboundAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        waId: true,
        profileName: true,
        mode: true,
        blockedAt: true,
        lastInboundAt: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, type: true, body: true, createdAt: true } },
        intakes: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true, clientName: true, service: { select: { name: true } } },
        },
      },
    }),
    prisma.waConversation.count({ where }),
    prisma.waConversation.count({ where: { ...REAL_CONVERSATION, mode: "HUMAN", blockedAt: null } }),
    ownerNumberSet(),
    getChannel().then(usesServiceWindow),
  ]);
  return {
    items: rows.map((c) => {
      const intake = c.intakes[0] ?? null;
      const last = c.messages[0];
      return {
        id: c.id,
        name: intake?.clientName ?? c.profileName ?? null,
        phoneMasked: maskPhone(c.waId),
        mode: c.mode,
        blocked: !!c.blockedAt,
        ownerTest: ownerNumbers.has(c.waId),
        lastMessage: last ? { direction: last.direction, preview: preview(last), at: last.createdAt } : null,
        lastInboundAt: c.lastInboundAt,
        outsideServiceWindow: serviceWindow && !isWithinServiceWindow(c.lastInboundAt),
        intake: intake && { id: intake.id, status: intake.status, serviceName: intake.service?.name ?? null },
      };
    }),
    total,
    page: input.page,
    pageSize: input.pageSize,
    needsAdmin,
  };
}

export type InboxListItem = Awaited<ReturnType<typeof listInbox>>["items"][number];

/** Riwayat chat satu percakapan (terbaru di bawah), maks 100 pesan terakhir. */
export async function getInboxConversation(id: string) {
  const c = await prisma.waConversation.findFirst({
    where: { id, ...REAL_CONVERSATION },
    select: {
      id: true,
      waId: true,
      profileName: true,
      mode: true,
      blockedAt: true,
      lastInboundAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          direction: true,
          type: true,
          body: true,
          mediaStorageKey: true,
          sentByBot: true,
          sentById: true,
          wamid: true,
          deliveryStatus: true,
          errorCode: true,
          createdAt: true,
        },
      },
      intakes: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, clientName: true, service: { select: { name: true } } },
      },
    },
  });
  if (!c) return null;
  const [ownerNumbers, serviceWindow] = await Promise.all([ownerNumberSet(), getChannel().then(usesServiceWindow)]);
  const intake = c.intakes[0] ?? null;
  const messages = await Promise.all(
    [...c.messages].reverse().map(async (m) => ({
      id: m.id,
      direction: m.direction,
      type: m.type,
      body: m.body,
      imageUrl: m.type === "image" ? await signedUrl(m.mediaStorageKey) : null,
      sentByBot: m.sentByBot,
      sentByAdmin: m.sentById !== null || isPhoneReplyWamid(m.wamid),
      deliveryStatus: m.deliveryStatus,
      errorCode: m.errorCode,
      createdAt: m.createdAt,
    })),
  );
  return {
    id: c.id,
    name: intake?.clientName ?? c.profileName ?? null,
    // Nomor lengkap untuk owner (menghubungi klien manual), sama seperti detail Order WA
    waId: c.waId,
    phoneMasked: maskPhone(c.waId),
    mode: c.mode,
    blockedAt: c.blockedAt,
    ownerTest: ownerNumbers.has(c.waId),
    lastInboundAt: c.lastInboundAt,
    outsideServiceWindow: serviceWindow && !isWithinServiceWindow(c.lastInboundAt),
    intake: intake && { id: intake.id, status: intake.status, serviceName: intake.service?.name ?? null },
    messages,
  };
}

export type InboxConversation = NonNullable<Awaited<ReturnType<typeof getInboxConversation>>>;

/** Catatan aktivitas per percakapan (Inbox bisa dipakai untuk nomor yang belum punya order). */
export function logConversationActivity(
  db: Prisma.TransactionClient,
  p: { conversationId: string; actorId: string; action: string; previousValue?: Prisma.InputJsonValue; newValue?: Prisma.InputJsonValue },
) {
  return db.activityLog.create({
    data: {
      entityType: "WaConversation",
      entityId: p.conversationId,
      action: p.action,
      actorId: p.actorId,
      previousValue: p.previousValue,
      newValue: p.newValue,
    },
  });
}
