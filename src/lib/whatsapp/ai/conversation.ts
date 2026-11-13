import { trimForAi } from "../spam-guard";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getStudioSettings } from "@/lib/studio";
import { getStudioOperations } from "@/lib/studio-operations";
import { mimeFromStorageKey, readPrivateMedia } from "../media";
import { aiWritableBriefFields, imageTargetFields, missingRequiredFields, type BriefDraft } from "./brief-schema";
import { buildStateBlock, buildSystemPrompt } from "./system-prompt";
import type { GuardExtras } from "./reply-guard";
import { allowedPriceNumbers, getDraftGuide, getPublishedGuide } from "./bot-guide";
import { getBotServiceCatalog, serviceGuardNumbers, servicePriceGroups, type BotService } from "./service-catalog";
import { moneyAmounts } from "./reply-guard";
import { ACTIVE_INTAKE_STATUSES, snapshotDpPercent } from "../intake";
import { DP_PERCENT } from "@/lib/constants";
import { getAiTargets } from "./ai-config";
import { createChatSession } from "@/lib/ai/fallback";
import { INTAKE_TOOLS, executeTool, findActiveIntake } from "./tools";

// Satu giliran AI untuk satu pesan masuk (§10.3 langkah 7–8).

const HISTORY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 4;
const MAX_PENDING_IMAGES = 3;
const RELAYED_ANSWER_DAYS = 7;
const RECENT_OUTBOUND_LIMIT = 5;

export type AiTurnResult = {
  reply: string | null;
  intakeStatus: string | null;
  // Isi brief setelah giliran ini (untuk reply-guard)
  briefText: string;
  // Nilai aturan harga owner di panduan yang dipakai giliran ini (untuk reply-guard)
  allowedPriceNumbers: string[];
  // Penjaga harga (reply-guard GuardExtras): teks kebijakan/FAQ owner dan katalog Layanan per layanan
  guardExtras: GuardExtras;
  // Nominal DP dan sisa pelunasan order ini: tidak boleh disebut bot setelah invoice (spec 2026-11-11 §5)
  dpGuardNumbers?: string[];
  toolsCalled: string[];
  /** Pesan keluar terakhir (terbaru dulu, maks 5): penjaga kalimat berulang (reply-guard dropRepeatedSentences) */
  recentOutbound?: string[];
  /** Alasan berhenti respons terakhir model (log saat balasan kosong, mis. max_tokens) */
  stopReason?: string | null;
};

type HistoryRow = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  type: string;
  body: string;
  mediaStorageKey: string | null;
  sentByBot: boolean;
};

/**
 * Penanda pesan keluar yang bukan tulisan AI (invoice/verifikasi DP dari portal, balasan admin dari portal atau HP).
 * Tanpa penanda, AI menganggapnya tulisan sendiri dan meralatnya bila tidak tercantum di STATE (produksi 2026-11-12).
 */
export const TEAM_MESSAGE_LABEL = "[Pesan dari tim studio]";

function describe(row: HistoryRow): string {
  if (row.type === "image") {
    const caption = row.body ? ` Keterangan klien: ${row.body}` : "";
    return row.mediaStorageKey
      ? `[Gambar dari klien, messageId=${row.id}]${caption}`
      : `[Gambar dari klien yang TIDAK tersimpan (melewati batas gambar atau gagal diunduh). Jangan bilang gambar ini sudah diterima atau dicatat.]${caption}`;
  }
  if (row.type === "unsupported") return "[Pesan jenis lain (suara/video/dokumen) yang tidak didukung]";
  // Teks panjang dipotong untuk AI; teks lengkap tetap tersimpan (docs/WHATSAPP_SPAM_GUARD.md §6).
  return trimForAi(row.body);
}

/**
 * History → MessageParam[]. Gambar yang belum ditanggapi bot (setelah balasan
 * terakhir) disertakan sebagai gambar; sisanya cukup teks.
 */
async function buildMessages(rows: HistoryRow[]) {
  const lastOutbound = rows.map((r) => r.direction).lastIndexOf("OUTBOUND");
  const pending = rows
    .slice(lastOutbound + 1)
    .filter((r) => r.type === "image" && r.mediaStorageKey)
    .slice(-MAX_PENDING_IMAGES);
  const pendingIds = new Set(pending.map((r) => r.id));

  const messages: Anthropic.MessageParam[] = [];
  for (const row of rows) {
    if (row.direction === "OUTBOUND") {
      messages.push({ role: "assistant", content: row.sentByBot ? row.body : `${TEAM_MESSAGE_LABEL} ${row.body}` });
      continue;
    }
    if (pendingIds.has(row.id) && row.mediaStorageKey) {
      const data = await readPrivateMedia(row.mediaStorageKey);
      messages.push({
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeFromStorageKey(row.mediaStorageKey), data: data.toString("base64") } },
          { type: "text", text: describe(row) },
        ],
      });
    } else {
      messages.push({ role: "user", content: describe(row) });
    }
  }
  // Pesan pertama wajib dari user.
  while (messages[0]?.role === "assistant") messages.shift();
  // Giliran tanpa pesan baru klien (meneruskan jawaban owner): model sekarang menolak pesan yang berakhir
  // di assistant (prefill) dengan 400, jadi ditutup catatan yang mengarahkan ke STATE.
  if (messages.length === 0 || messages.at(-1)?.role === "assistant") {
    messages.push({ role: "user", content: "[Belum ada pesan baru dari klien. Lanjutkan percakapan sesuai STATE.]" });
  }
  return { messages, pendingImageIds: pending.map((r) => r.id) };
}

async function buildState(conversationId: string, pendingImageMessageIds: string[], services: BotService[], rows: HistoryRow[]) {
  const intake = await prisma.waIntake.findFirst({
    where: { conversationId, status: { in: ACTIVE_INTAKE_STATUSES } },
    orderBy: { createdAt: "desc" },
    select: {
      status: true,
      clientName: true,
      clientEmail: true,
      briefDraft: true,
      agreedPrice: true,
      dpAmount: true,
      dpPercent: true,
      deadline: true,
      invoiceNumber: true,
      pricingRulesApplied: true,
      service: { select: { code: true, name: true } },
    },
  });
  const ownerQueries = await prisma.waOwnerQuery.findMany({
    where: {
      conversationId,
      OR: [
        { status: "PENDING" },
        { status: "ANSWERED", relayedAt: null },
        // Sudah disampaikan: tetap ditampilkan supaya bot tidak bertanya ulang ke owner (kasus Day 2026-11-12).
        { status: "ANSWERED", relayedAt: { not: null }, answeredAt: { gt: new Date(Date.now() - RELAYED_ANSWER_DAYS * 86_400_000) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { question: true, status: true, approved: true, note: true, relayedAt: true },
  });

  const code = intake?.service?.code;
  const draft = (intake?.briefDraft as BriefDraft) ?? {};
  // Gambar klien di riwayat yang belum masuk brief (termasuk yang dikirim sebelum start_intake): item brief dari
  // attach_image_to_brief memuat id pesan di id/URL-nya. Hanya saat brief dikumpulkan; sesudahnya gambar bisa bukti transfer.
  const imageTargets = code ? imageTargetFields(code) : [];
  const draftJson = JSON.stringify(draft);
  const unattachedImageMessageIds =
    intake?.status === "COLLECTING" && imageTargets.length
      ? rows.filter((r) => r.direction === "INBOUND" && r.type === "image" && r.mediaStorageKey && !draftJson.includes(r.id)).map((r) => r.id)
      : [];
  return buildStateBlock({
    now: new Date(),
    intake: intake && {
      status: intake.status,
      service: intake.service,
      serviceDetail: services.find((s) => s.code === intake.service?.code) ?? null,
      clientName: intake.clientName,
      clientEmail: intake.clientEmail,
      briefDraft: draft,
      missingRequired: code ? missingRequiredFields(code, draft) : [],
      writableFields: code ? aiWritableBriefFields(code) : [],
      imageTargets,
      quote:
        intake.agreedPrice !== null && intake.dpAmount !== null && intake.deadline
          ? {
              agreedPrice: intake.agreedPrice,
              dpAmount: intake.dpAmount,
              dpPercent: snapshotDpPercent(intake) ?? DP_PERCENT,
              deadline: intake.deadline,
              invoiceNumber: intake.invoiceNumber,
            }
          : null,
    },
    pricingRulesApplied: Array.isArray(intake?.pricingRulesApplied)
      ? (intake.pricingRulesApplied as { ruleId: string; name: string }[])
      : [],
    ownerQueries: ownerQueries.map(({ relayedAt, ...q }) => ({
      ...q,
      status: q.status === "PENDING" ? ("PENDING" as const) : relayedAt ? ("RELAYED" as const) : ("ANSWERED" as const),
    })),
    pendingImageMessageIds,
    unattachedImageMessageIds,
  });
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * Jalankan Claude + tools untuk pesan `messageId`. Melempar error jika API gagal
 * atau model menolak; pemanggil yang menangani fallback.
 */
export async function runAiTurn(params: { conversationId: string; messageId: string }): Promise<AiTurnResult> {
  // Provider/model pilihan owner (Bot AI › Model) dengan cadangan; docs/AI_PROVIDERS.md.
  const targets = await getAiTargets();
  // Satu sesi per giliran: cadangan menempel setelah utama gagal (tidak mencampur provider di tengah giliran).
  const chat = createChatSession(targets);
  const current = await prisma.waMessage.findUniqueOrThrow({
    where: { id: params.messageId },
    select: { createdAt: true },
  });
  const rows = (
    await prisma.waMessage.findMany({
      where: {
        conversationId: params.conversationId,
        createdAt: { lte: current.createdAt },
        // Balasan yang gagal terkirim tidak pernah dilihat klien.
        NOT: { direction: "OUTBOUND", deliveryStatus: "failed" },
      },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: { id: true, direction: true, type: true, body: true, mediaStorageKey: true, sentByBot: true },
    })
  ).reverse();

  const { messages, pendingImageIds } = await buildMessages(rows);
  const studio = await getStudioSettings();
  // Uji bot memakai draft panduan owner; klien sungguhan hanya versi terbit.
  const { isSandbox } = await prisma.waConversation.findUniqueOrThrow({
    where: { id: params.conversationId },
    select: { isSandbox: true },
  });
  const guide = isSandbox ? await getDraftGuide() : ((await getPublishedGuide())?.guide ?? null);
  const services = await getBotServiceCatalog();
  const ops = await getStudioOperations();
  // Aturan statis + panduan owner (di-cache; berubah hanya saat panduan diterbitkan) lalu
  // STATE dinamis. Keduanya di system prompt: kanal operator yang terpisah dari teks klien
  // dan didukung semua model Claude.
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: buildSystemPrompt(studio.name, guide, ops, services), cache_control: { type: "ephemeral" } },
    { type: "text", text: await buildState(params.conversationId, pendingImageIds, services, rows) },
  ];

  const toolsCalled: string[] = [];
  // calculatedTotals/Breakdowns: diisi calculate_price, dipakai penjaga harga giliran ini.
  const ctx = { conversationId: params.conversationId, isSandbox, calculatedTotals: [] as number[], calculatedBreakdowns: [] as string[] };

  for (let round = 0; ; round++) {
    const toolsAllowed = round < MAX_TOOL_ROUNDS;
    const response = await chat.create({
      max_tokens: targets.maxTokens,
      system,
      tools: INTAKE_TOOLS,
      tool_choice: toolsAllowed ? { type: "auto" } : { type: "none" },
      messages,
    });

    if (response.stop_reason === "refusal") throw new Error("AI_REFUSAL");

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const finalIntake = await findActiveIntake(params.conversationId);
      return {
        reply: textOf(response) || null,
        intakeStatus: finalIntake?.status ?? null,
        briefText: JSON.stringify(finalIntake?.briefDraft ?? {}),
        allowedPriceNumbers: allowedPriceNumbers(guide),
        dpGuardNumbers:
          finalIntake?.agreedPrice != null && finalIntake.dpAmount != null
            ? [String(finalIntake.dpAmount), String(finalIntake.agreedPrice - finalIntake.dpAmount)]
            : [],
        guardExtras: {
          // Bot diminta mengutip teks ini apa adanya; nominal di dalamnya bukan harga karangan.
          policyNumbers: [ops.revisionNotice, ops.settlementNote, ...(guide?.faqs ?? []).map((f) => f.answer)],
          catalogGroups: servicePriceGroups(services),
          ...serviceGuardNumbers(services, finalIntake?.service?.code),
          // Hanya nominal uang dari rincian ("5 item" bukan harga), supaya angka biasa tidak ikut diloloskan.
          calculatedTotals: [...new Set([...ctx.calculatedTotals.map(String), ...ctx.calculatedBreakdowns.flatMap(moneyAmounts)])],
        },
        toolsCalled,
        recentOutbound: rows
          .filter((r) => r.direction === "OUTBOUND")
          .slice(-RECENT_OUTBOUND_LIMIT)
          .reverse()
          .map((r) => r.body),
        stopReason: response.stop_reason ?? null,
      };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      toolsCalled.push(use.name);
      const outcome = await executeTool(use.name, use.input, ctx);
      results.push({ type: "tool_result", tool_use_id: use.id, content: outcome.content, is_error: outcome.isError });
    }
    messages.push({ role: "user", content: results });
  }
}
