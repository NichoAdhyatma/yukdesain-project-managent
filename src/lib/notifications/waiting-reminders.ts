import { prisma } from "@/lib/db";
import { listOwnerNumbers } from "@/lib/whatsapp/owner/identity";
import { maskPhone } from "@/lib/whatsapp/phone";
import { isSmallTalk } from "@/lib/whatsapp/spam-guard";
import { notifyOwnersPush } from "./push";

// Pengingat "menunggu admin" lewat web push (docs/OWNER_NOTIFICATIONS_INBOX.md §2a). Dipanggil cron tiap 5 menit.
// Produksi 2026-11-13: 4 chat mode admin menunggu 1–2 jam ("chatnya ketimbun"), pertanyaan bot ke owner menunggu
// berjam-jam, dan DP Mif diterima lewat HP tanpa invoice di portal. Notifikasi lama hanya dikirim sekali per kejadian.

export const REMIND_AFTER_MS = 30 * 60_000;
export const REMIND_AGAIN_AFTER_MS = 2 * 60 * 60_000;
export const MAX_REMINDERS = 2;
const LOOKBACK_MS = 24 * 60 * 60_000;
const RECENT_ORDER_MS = 30 * 24 * 60 * 60_000;
const KEEP_RECORDS_MS = 3 * 24 * 60 * 60_000;
const MAX_LINES = 4;
const PHONE_REPLY_PREFIX = "kirimi:phone:";

export type WaitingItem = {
  key: string;
  kind: "chat" | "query" | "dp_phone";
  conversationId: string;
  name: string;
  waId: string;
  since: Date;
};

type ReminderRecord = { count: number; lastSentAt: Date };
type ChatMessage = { id: string; direction: string; type: string; body: string; createdAt: Date };

const KIND_TEXT: Record<WaitingItem["kind"], string> = {
  chat: "chat belum dibalas",
  query: "pertanyaan bot belum dijawab",
  dp_phone: "DP lewat HP belum dicatat di portal",
};

/**
 * Pesan klien pertama yang belum dibalas dan bukan basa-basi (pesan diurutkan terbaru dulu). Null bila pesan terakhir
 * dari admin/bot, atau pesan klien sesudahnya hanya basa-basi ("Baik kak", "ok, ditunggu") yang memang tidak perlu dibalas.
 */
export function unansweredSince(messagesNewestFirst: ChatMessage[]): { id: string; createdAt: Date } | null {
  const trailing: ChatMessage[] = [];
  for (const m of messagesNewestFirst) {
    if (m.direction !== "INBOUND") break;
    trailing.push(m);
  }
  // Terlama dulu; basa-basi di awal ("Baik dtunggu kak") tidak memulai hitungan menunggu.
  const first = trailing.reverse().find((m) => !(m.type === "text" && isSmallTalk(m.body)));
  return first ? { id: first.id, createdAt: first.createdAt } : null;
}

const DP_ACCEPTED = /\b(dp|pembayaran)\b[^\n.]{0,40}\bterima/i;

/** Pesan admin dari HP yang memuat nomor rekening studio atau kabar "DP kami terima". */
export function mentionsPaymentDetails(text: string, accountNumbers: string[]): boolean {
  const digits = text.replace(/[\s.-]/g, "");
  if (accountNumbers.some((n) => n.length >= 6 && digits.includes(n.replace(/\D/g, "")))) return true;
  return DP_ACCEPTED.test(text);
}

/** Pengingat pertama setelah 30 menit, kedua setelah 2 jam (paling cepat 30 menit dari yang pertama), lalu berhenti. */
export function isReminderDue(since: Date, record: ReminderRecord | undefined, now: Date): boolean {
  const waited = now.getTime() - since.getTime();
  if (!record) return waited >= REMIND_AFTER_MS;
  if (record.count >= MAX_REMINDERS) return false;
  return waited >= REMIND_AGAIN_AFTER_MS && now.getTime() - record.lastSentAt.getTime() >= REMIND_AFTER_MS;
}

function waitedText(since: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - since.getTime()) / 60_000);
  if (minutes < 60) return `${minutes} mnt`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} jam ${rest} mnt` : `${hours} jam`;
}

export function buildReminderPush(items: WaitingItem[], now: Date): { title: string; body: string; url: string } {
  const sorted = [...items].sort((a, b) => a.since.getTime() - b.since.getTime());
  const lines = sorted
    .slice(0, MAX_LINES)
    .map((i) => `${i.name} (${maskPhone(i.waId)}) · ${KIND_TEXT[i.kind]} · ${waitedText(i.since, now)}`);
  if (sorted.length > MAX_LINES) lines.push(`dan ${sorted.length - MAX_LINES} lainnya`);
  const single = items.length === 1 && items[0].kind === "chat" ? `&chat=${items[0].conversationId}` : "";
  return { title: `${items.length} hal menunggu admin`, body: lines.join("\n"), url: `/wa-orders?tab=inbox${single}` };
}

async function waitingChats(now: Date, owners: Set<string>): Promise<WaitingItem[]> {
  const chats = await prisma.waConversation.findMany({
    where: { mode: "HUMAN", isSandbox: false, blockedAt: null, lastInboundAt: { gte: new Date(now.getTime() - LOOKBACK_MS) } },
    select: {
      id: true,
      waId: true,
      profileName: true,
      messages: { orderBy: { createdAt: "desc" }, take: 30, select: { id: true, direction: true, type: true, body: true, createdAt: true } },
    },
  });
  return chats.flatMap((c) => {
    if (owners.has(c.waId)) return [];
    const since = unansweredSince(c.messages);
    if (!since) return [];
    return [{ key: `chat:${since.id}`, kind: "chat" as const, conversationId: c.id, name: c.profileName ?? "Klien", waId: c.waId, since: since.createdAt }];
  });
}

async function waitingQueries(now: Date): Promise<WaitingItem[]> {
  const queries = await prisma.waOwnerQuery.findMany({
    where: { status: "PENDING", expiresAt: { gt: now }, conversation: { isSandbox: false } },
    select: { id: true, createdAt: true, conversationId: true, conversation: { select: { waId: true, profileName: true } } },
  });
  const items: WaitingItem[] = [];
  for (const q of queries) {
    // Admin sudah membalas klien itu langsung (HP atau portal) setelah pertanyaan dibuat → dianggap ditangani.
    const adminReplies = await prisma.waMessage.count({
      where: {
        conversationId: q.conversationId,
        direction: "OUTBOUND",
        createdAt: { gt: q.createdAt },
        OR: [{ sentById: { not: null } }, { wamid: { startsWith: PHONE_REPLY_PREFIX } }],
      },
    });
    if (adminReplies > 0) continue;
    // Order klien itu sudah diberi harga sesudah pertanyaan dibuat (Day 13 Nov) → sudah ditangani lewat portal.
    if ((await prisma.waIntake.count({ where: { conversationId: q.conversationId, quotedAt: { gt: q.createdAt } } })) > 0) continue;
    items.push({ key: `query:${q.id}`, kind: "query", conversationId: q.conversationId, name: q.conversation.profileName ?? "Klien", waId: q.conversation.waId, since: q.createdAt });
  }
  return items;
}

async function dpViaPhone(now: Date): Promise<WaitingItem[]> {
  const accounts = (await prisma.paymentAccount.findMany({ where: { isActive: true }, select: { accountNumber: true } })).map((a) => a.accountNumber);
  const echoes = await prisma.waMessage.findMany({
    where: {
      direction: "OUTBOUND",
      wamid: { startsWith: PHONE_REPLY_PREFIX },
      createdAt: { gte: new Date(now.getTime() - LOOKBACK_MS) },
      conversation: { isSandbox: false },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, body: true, createdAt: true, conversationId: true, conversation: { select: { waId: true, profileName: true, clientId: true } } },
  });
  const firstPerChat = new Map<string, (typeof echoes)[number]>();
  for (const e of echoes) {
    if (!firstPerChat.has(e.conversationId) && mentionsPaymentDetails(e.body, accounts)) firstPerChat.set(e.conversationId, e);
  }

  const recent = new Date(now.getTime() - RECENT_ORDER_MS);
  const items: WaitingItem[] = [];
  for (const e of firstPerChat.values()) {
    // Invoice portal sudah ada, atau project klien baru dibuat (mis. pelunasan) → sudah tercatat.
    const quoted = await prisma.waIntake.findFirst({ where: { conversationId: e.conversationId, quotedAt: { gte: recent } }, select: { id: true } });
    if (quoted) continue;
    if (e.conversation.clientId && (await prisma.project.count({ where: { clientId: e.conversation.clientId, createdAt: { gte: recent } } })) > 0) continue;
    items.push({ key: `dp:${e.id}`, kind: "dp_phone", conversationId: e.conversationId, name: e.conversation.profileName ?? "Klien", waId: e.conversation.waId, since: e.createdAt });
  }
  return items;
}

export async function findWaitingItems(now: Date): Promise<WaitingItem[]> {
  const owners = new Set((await listOwnerNumbers()).map((o) => o.waNumber));
  return [...(await waitingChats(now, owners)), ...(await waitingQueries(now)), ...(await dpViaPhone(now))];
}

/** Satu push ringkas bila ada item yang jatuh tempo; tiap item paling banyak diingatkan 2 kali. */
export async function sendWaitingReminders(now: Date): Promise<{ waiting: number; reminded: number }> {
  await prisma.adminWaitReminder.deleteMany({ where: { lastSentAt: { lt: new Date(now.getTime() - KEEP_RECORDS_MS) } } });

  const candidates = (await findWaitingItems(now)).filter((i) => now.getTime() - i.since.getTime() >= REMIND_AFTER_MS);
  if (candidates.length === 0) return { waiting: 0, reminded: 0 };

  const records = new Map(
    (await prisma.adminWaitReminder.findMany({ where: { key: { in: candidates.map((i) => i.key) } } })).map((r) => [r.key, r]),
  );
  const waiting = candidates.filter((i) => (records.get(i.key)?.count ?? 0) < MAX_REMINDERS);
  const due = waiting.filter((i) => isReminderDue(i.since, records.get(i.key), now));
  if (due.length === 0) return { waiting: waiting.length, reminded: 0 };

  const { title, body, url } = buildReminderPush(waiting, now);
  await notifyOwnersPush("WAITING_REMINDER", { title, body, url, tag: "waiting-reminder" });
  for (const item of due) {
    await prisma.adminWaitReminder.upsert({
      where: { key: item.key },
      create: { key: item.key, count: 1, lastSentAt: now },
      update: { count: { increment: 1 }, lastSentAt: now },
    });
  }
  return { waiting: waiting.length, reminded: due.length };
}
