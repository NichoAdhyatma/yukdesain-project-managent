import { trimForAi } from "../spam-guard";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getStudioSettings } from "@/lib/studio";
import { getStudioOperations } from "@/lib/studio-operations";
import { mimeFromStorageKey, readPrivateMedia } from "../media";
import { aiWritableBriefFields, imageTargetFields, missingRequiredFields, type BriefDraft } from "./brief-schema";
import { buildStateBlock, buildSystemPrompt } from "./system-prompt";
import { allowedPriceNumbers, getDraftGuide, getPublishedGuide } from "./bot-guide";
import { getBotServiceCatalog, servicePriceNumbers, type BotService } from "./service-catalog";
import { ACTIVE_INTAKE_STATUSES, snapshotDpPercent } from "../intake";
import { DP_PERCENT } from "@/lib/constants";
import { getAiConfig, getAnthropicClient } from "./ai-config";
import { modelRequestOptions } from "./model-profile";
import { INTAKE_TOOLS, executeTool, findActiveIntake } from "./tools";

// Satu giliran AI untuk satu pesan masuk (§10.3 langkah 7–8).

const HISTORY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 4;
const MAX_PENDING_IMAGES = 3;

export type AiTurnResult = {
  reply: string | null;
  intakeStatus: string | null;
  // Isi brief setelah giliran ini (untuk reply-guard)
  briefText: string;
  // Nilai aturan harga owner di panduan yang dipakai giliran ini (untuk reply-guard)
  allowedPriceNumbers: string[];
  // Harga mulai + angka catatan harga dari menu Layanan; penjaga memakainya hanya untuk kalimat harga
  catalogPriceNumbers: string[];
  toolsCalled: string[];
};

type HistoryRow = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  type: string;
  body: string;
  mediaStorageKey: string | null;
};

function describe(row: HistoryRow): string {
  if (row.type === "image") {
    const caption = row.body ? ` Keterangan klien: ${row.body}` : "";
    return row.mediaStorageKey
      ? `[Gambar dari klien, messageId=${row.id}]${caption}`
      : `[Gambar dari klien yang tidak bisa diproses]${caption}`;
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
      messages.push({ role: "assistant", content: row.body });
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
  return { messages, pendingImageIds: pending.map((r) => r.id) };
}

async function buildState(conversationId: string, pendingImageMessageIds: string[], services: BotService[]) {
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
      pricingRulesApplied: true,
      service: { select: { code: true, name: true } },
    },
  });
  const ownerQueries = await prisma.waOwnerQuery.findMany({
    where: { conversationId, OR: [{ status: "PENDING" }, { status: "ANSWERED", relayedAt: null }] },
    orderBy: { createdAt: "asc" },
    select: { question: true, status: true, approved: true, note: true },
  });
  const paymentAccounts =
    intake?.status === "QUOTED"
      ? await prisma.paymentAccount.findMany({
          where: { isActive: true },
          select: { name: true, accountNumber: true, accountHolder: true },
          orderBy: { order: "asc" },
        })
      : [];

  const code = intake?.service?.code;
  const draft = (intake?.briefDraft as BriefDraft) ?? {};
  return buildStateBlock({
    intake: intake && {
      status: intake.status,
      service: intake.service,
      serviceDetail: services.find((s) => s.code === intake.service?.code) ?? null,
      clientName: intake.clientName,
      clientEmail: intake.clientEmail,
      briefDraft: draft,
      missingRequired: code ? missingRequiredFields(code, draft) : [],
      writableFields: code ? aiWritableBriefFields(code) : [],
      imageTargets: code ? imageTargetFields(code) : [],
      quote:
        intake.agreedPrice !== null && intake.dpAmount !== null && intake.deadline
          ? {
              agreedPrice: intake.agreedPrice,
              dpAmount: intake.dpAmount,
              dpPercent: snapshotDpPercent(intake) ?? DP_PERCENT,
              deadline: intake.deadline,
            }
          : null,
    },
    paymentAccounts,
    pricingRulesApplied: Array.isArray(intake?.pricingRulesApplied)
      ? (intake.pricingRulesApplied as { ruleId: string; name: string }[])
      : [],
    ownerQueries: ownerQueries.map((q) => ({ ...q, status: q.status === "PENDING" ? ("PENDING" as const) : ("ANSWERED" as const) })),
    pendingImageMessageIds,
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
  const config = await getAiConfig();
  const client = getAnthropicClient(config);
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
      select: { id: true, direction: true, type: true, body: true, mediaStorageKey: true },
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
  // Aturan statis + panduan owner (di-cache; berubah hanya saat panduan diterbitkan) lalu
  // STATE dinamis. Keduanya di system prompt: kanal operator yang terpisah dari teks klien
  // dan didukung semua model Claude.
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: buildSystemPrompt(studio.name, guide, await getStudioOperations(), services), cache_control: { type: "ephemeral" } },
    { type: "text", text: await buildState(params.conversationId, pendingImageIds, services) },
  ];

  const toolsCalled: string[] = [];
  const ctx = { conversationId: params.conversationId, isSandbox };

  for (let round = 0; ; round++) {
    const toolsAllowed = round < MAX_TOOL_ROUNDS;
    const response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system,
      tools: INTAKE_TOOLS,
      tool_choice: toolsAllowed ? { type: "auto" } : { type: "none" },
      ...modelRequestOptions(config.model),
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
        catalogPriceNumbers: servicePriceNumbers(services),
        toolsCalled,
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
