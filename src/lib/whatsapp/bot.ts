import { prisma } from "@/lib/db";
import { markAsReadOnChannel } from "./channel";
import { storeInboundMedia } from "./media";
import { findActiveIntake } from "./ai/tools";
import { botReplyLimitReached, checkInboundRate, imageLimitExceeded } from "./rate-limit";
import { BOT_REPLIES, isSuperseded, replyWithAi, sendBotText, setHumanMode } from "./bot-reply";
import { resolveOwner } from "./owner/identity";
import { handleOwnerMessage } from "./owner/handle";
import { notifyNewClient } from "@/lib/notifications/owner-events";
import { SMALL_TALK_SILENT_STATUSES, getMonthlyBrake, isSmallTalk, notifyOwnersBrakeOnce } from "./spam-guard";

export { BOT_REPLIES, sendBotText } from "./bot-reply";

// Orkestrasi pesan masuk (docs/WHATSAPP_AI_CHATBOT.md §10.3).

// Kata kunci untuk langsung bicara dengan admin (§10.3 langkah 3).
const HANDOFF_KEYWORDS = new Set(["admin", "cs"]);

export async function handleInboundMessage(messageId: string): Promise<void> {
  const message = await prisma.waMessage.findUniqueOrThrow({
    where: { id: messageId },
    select: {
      id: true,
      wamid: true,
      type: true,
      body: true,
      createdAt: true,
      contextWamid: true,
      conversation: { select: { id: true, waId: true, mode: true, isSandbox: true, blockedAt: true, ownerActsAsClient: true } },
    },
  });
  const { conversation } = message;

  // Nomor diblokir admin: pesan tetap tersimpan untuk arsip, bot diam (docs/WHATSAPP_SPAM_GUARD.md §5).
  if (conversation.blockedAt && !conversation.isSandbox) return;

  // Nomor owner (atau Uji bot sebagai owner): instruksi ke bot, bukan chat klien
  // (docs/WHATSAPP_OWNER_COMMANDS.md §3).
  const owner = await resolveOwner(conversation);
  // Owner tes sebagai klien (#klien) memakai alur klien; #owner kembali ke instruksi (docs/WHATSAPP_OWNER_COMMANDS.md §9).
  const ownerTesting = !!owner && !conversation.isSandbox && conversation.ownerActsAsClient;
  if (owner) {
    const command = !conversation.isSandbox && message.type === "text" ? ownerModeCommand(message.body) : null;
    if (command) {
      if (message.wamid) await markAsReadOnChannel(message.wamid).catch(() => undefined);
      await prisma.waConversation.update({
        where: { id: conversation.id },
        // Masuk mode klien juga mengembalikan chat ke bot, kalau tes sebelumnya berakhir di admin.
        data: command === "client" ? { ownerActsAsClient: true, mode: "BOT" } : { ownerActsAsClient: false },
      });
      await sendBotText(conversation, command === "client" ? BOT_REPLIES.ownerClientModeOn : BOT_REPLIES.ownerClientModeOff);
      return;
    }
    if (!ownerTesting) {
      if (message.wamid) await markAsReadOnChannel(message.wamid).catch(() => undefined);
      await handleOwnerMessage(message, conversation, owner);
      return;
    }
  }

  // Nomor yang pertama kali menghubungi bot → notifikasi owner, juga saat bot nonaktif (docs/OWNER_NOTIFICATIONS_INBOX.md).
  // Ditentukan dari pesan paling awal, bukan jumlah pesan: setelah jeda gabung pesan (waitForBurst), pesan kedua
  // klien yang mengetik beruntun sudah tersimpan saat pesan pertama diproses.
  if (!conversation.isSandbox) {
    const first = await prisma.waMessage.findFirst({
      where: { conversationId: conversation.id, direction: "INBOUND" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    if (first?.id === message.id) void notifyNewClient(conversation.id);
  }

  // Saklar dibaca langsung tanpa cache: mematikan bot harus langsung berlaku. Uji bot dan owner yang
  // sedang tes sebagai klien tetap jalan saat bot nonaktif, supaya owner bisa mencoba sebelum menyalakannya.
  if (!conversation.isSandbox && !ownerTesting) {
    const settings = await prisma.studioSettings.findUnique({
      where: { id: "default" },
      select: { waBotEnabled: true },
    });
    if (!settings?.waBotEnabled) return;
  }
  if (conversation.mode === "HUMAN") return;

  // Rem bulanan: balasan bot bulan ini sudah mencapai batas owner → satu pesan, lalu admin (§3).
  if (!conversation.isSandbox) {
    const brake = await getMonthlyBrake();
    if (brake.active) {
      await setHumanMode(conversation.id, "monthly_brake");
      await sendBotText(conversation, BOT_REPLIES.monthlyCap);
      await notifyOwnersBrakeOnce(brake).catch((error) =>
        console.error("[whatsapp] info rem bulanan gagal:", (error as Error).name),
      );
      return;
    }
  }

  if (message.wamid) {
    // Centang biru hanya kosmetik; gagal tidak menghentikan balasan.
    await markAsReadOnChannel(message.wamid).catch(() => undefined);
  }

  // Banjir pesan: peringatan sekali, sisanya diabaikan (§17). Owner yang menguji tidak dibatasi.
  const rate = conversation.isSandbox ? "ok" : await checkInboundRate(conversation.id, message.createdAt);
  if (rate === "warn") {
    await sendBotText(conversation, BOT_REPLIES.tooManyMessages);
    return;
  }
  if (rate === "ignore") return;

  if (message.type === "text" && HANDOFF_KEYWORDS.has(message.body.trim().toLowerCase())) {
    await setHumanMode(conversation.id, "client_asked");
    await sendBotText(conversation, BOT_REPLIES.handoff);
    return;
  }

  if (message.type === "unsupported") {
    await sendBotText(conversation, BOT_REPLIES.unsupported);
    return;
  }

  if (message.type === "image") {
    const intake = await findActiveIntake(conversation.id);
    if (await imageLimitExceeded(conversation.id, intake?.createdAt ?? null)) {
      await sendBotText(conversation, BOT_REPLIES.tooManyImages);
      return;
    }
    // Disimpan dulu walau nanti dilewati: giliran pesan berikutnya membutuhkan gambarnya.
    const result = await storeInboundMedia(message.id);
    if (!result.ok) {
      await sendBotText(conversation, BOT_REPLIES[result.reason]);
      return;
    }
  }

  // Pesan beruntun: webhook menunggu sebentar sebelum memanggil bot, jadi giliran lama berhenti di sini
  // dan hanya pesan terakhir yang dibalas (docs/WHATSAPP_SPAM_GUARD.md §2).
  if (await isSuperseded(conversation.id, message.createdAt)) return;

  // Basa-basi setelah brief dikonfirmasi ("ok", "makasih", emoji): tidak perlu balasan (§4).
  if (message.type === "text" && !conversation.isSandbox && isSmallTalk(message.body) && (await briefAlreadyConfirmed(conversation.id))) {
    return;
  }

  // Batas biaya: percakapan yang sangat panjang dialihkan ke admin (§17).
  if (await botReplyLimitReached(conversation.id)) {
    await setHumanMode(conversation.id, "daily_limit");
    await sendBotText(conversation, BOT_REPLIES.dailyLimit);
    return;
  }

  await replyWithAi(conversation, message, { checkSuperseded: true });
}

/** Order terakhir sudah lewat tahap brief (menunggu harga, verifikasi DP, atau sudah jadi project). */
async function briefAlreadyConfirmed(conversationId: string): Promise<boolean> {
  const latest =
    (await findActiveIntake(conversationId)) ??
    (await prisma.waIntake.findFirst({ where: { conversationId }, orderBy: { createdAt: "desc" }, select: { status: true } }));
  return !!latest && SMALL_TALK_SILENT_STATUSES.has(latest.status);
}

/** "#klien" → owner tes sebagai klien, "#owner" → kembali memberi instruksi. */
export function ownerModeCommand(text: string): "client" | "owner" | null {
  const t = text.trim().toLowerCase();
  if (t === "#klien" || t === "#client") return "client";
  if (t === "#owner") return "owner";
  return null;
}
