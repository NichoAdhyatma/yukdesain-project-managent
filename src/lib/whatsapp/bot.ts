import { prisma } from "@/lib/db";
import { markAsReadOnChannel } from "./channel";
import { storeInboundMedia } from "./media";
import { findActiveIntake } from "./ai/tools";
import { botReplyLimitReached, checkInboundRate, imageLimitExceeded } from "./rate-limit";
import { BOT_REPLIES, isSuperseded, replyWithAi, sendBotText } from "./bot-reply";
import { callAdmin, lastOutboundIs, onceWithin } from "./handoff";

/** Pesan "gambar sudah banyak" paling banyak sekali per chat per rentang ini (Mif 13 Nov: 12 pesan dalam 8 detik). */
const IMAGE_LIMIT_NOTICE_MS = 10 * 60_000;
import { resolveOwner } from "./owner/identity";
import { handleOwnerMessage } from "./owner/handle";
import { notifyNewClient } from "@/lib/notifications/owner-events";
import { SMALL_TALK_SILENT_STATUSES, getMonthlyBrake, isSmallTalk, notifyOwnersBrakeOnce } from "./spam-guard";
import { resendPendingInvoice } from "./invoice";
import { WA_RATE_LIMITS } from "@/lib/constants";

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
    // Invoice yang baru sampai sebagai template (Meta di luar 24 jam) dikirim lengkap sekarang, juga saat bot nonaktif:
    // ini pesan sistem dari aksi admin, bukan balasan bot (spec 2026-11-11 §5).
    await resendPendingInvoice(conversation.id).catch((error) =>
      console.error("[whatsapp] kirim ulang invoice gagal:", (error as Error).name),
    );
  }

  // Saklar dibaca langsung tanpa cache: mematikan bot harus langsung berlaku. Uji bot dan owner yang
  // sedang tes sebagai klien tetap jalan saat bot nonaktif, supaya owner bisa mencoba sebelum menyalakannya.
  if (!conversation.isSandbox && !ownerTesting) {
    const settings = await prisma.studioSettings.findUnique({
      where: { id: "default" },
      select: { waBotEnabled: true },
    });
    if (!settings?.waBotEnabled) return storeImageWhileSilent(message, conversation.id);
  }
  if (conversation.mode === "HUMAN") return storeImageWhileSilent(message, conversation.id);

  // Rem bulanan: balasan bot bulan ini sudah mencapai batas owner → satu pesan, lalu admin (§3).
  if (!conversation.isSandbox) {
    const brake = await getMonthlyBrake();
    if (brake.active) {
      // Chat tetap BOT (keputusan owner 2026-11-13); pesan rem cukup sekali, setelah itu bot diam selama rem aktif.
      callAdmin(conversation.id, "monthly_brake");
      if (!(await lastOutboundIs(conversation.id, BOT_REPLIES.monthlyCap))) await sendBotText(conversation, BOT_REPLIES.monthlyCap);
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
    // Admin dipanggil; chat pindah ke mode admin saat admin membalas sendiri (keputusan owner 2026-11-13).
    callAdmin(conversation.id, "client_asked");
    await sendBotText(conversation, BOT_REPLIES.handoff);
    return;
  }

  if (message.type === "unsupported") {
    await sendBotText(conversation, BOT_REPLIES.unsupported);
    return;
  }

  if (message.type === "image") {
    const intake = await findActiveIntake(conversation.id);
    if (await imageLimitExceeded(conversation.id, imageWindowStart(intake))) {
      callAdmin(conversation.id, "image_limit");
      if (onceWithin(`image-limit:${conversation.id}`, IMAGE_LIMIT_NOTICE_MS)) await sendBotText(conversation, BOT_REPLIES.tooManyImages);
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

  // Batas biaya: percakapan yang sangat panjang → admin dipanggil, bot berhenti membalas sampai besok (§17).
  // Chat tetap BOT (keputusan owner 2026-11-13); pesan batas cukup sekali.
  if (await botReplyLimitReached(conversation.id)) {
    callAdmin(conversation.id, "daily_limit");
    if (!(await lastOutboundIs(conversation.id, BOT_REPLIES.dailyLimit))) await sendBotText(conversation, BOT_REPLIES.dailyLimit);
    return;
  }

  await replyWithAi(conversation, message, { checkSuperseded: true });
}

/**
 * Bot tidak membalas (nonaktif / chat dipegang admin), tetapi gambar klien tetap diunduh ke storage privat supaya
 * terlihat di Inbox dan bisa dibaca bot setelah chat dikembalikan. Produksi 2026-11-13 (Mif): 10 foto saat mode admin
 * tidak pernah diunduh. Batasnya lebih longgar dari mode bot (admin sendiri yang meminta foto); gagal unduh tidak
 * menghentikan apa pun.
 */
async function storeImageWhileSilent(message: { id: string; type: string }, conversationId: string): Promise<void> {
  if (message.type !== "image") return;
  const intake = await findActiveIntake(conversationId);
  if (await imageLimitExceeded(conversationId, imageWindowStart(intake), new Date(), WA_RATE_LIMITS.imagesWhileAdmin)) return;
  try {
    await storeInboundMedia(message.id);
  } catch (error) {
    console.error("[whatsapp] unduh gambar saat bot diam gagal:", (error as Error).name);
  }
}

/**
 * Kuota gambar dihitung per tahap order: sejak order dibuat, lalu mulai lagi sejak invoice dikirim, supaya foto brief
 * tidak menghabiskan kuota bukti transfer (produksi 2026-11-13, Mif: bukti DP setelah 25 foto brief tidak tersimpan).
 */
function imageWindowStart(intake: { createdAt: Date; quotedAt?: Date | null } | null): Date | null {
  if (!intake) return null;
  return intake.quotedAt && intake.quotedAt > intake.createdAt ? intake.quotedAt : intake.createdAt;
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
