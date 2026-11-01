import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getStudioSettings } from "@/lib/studio";
import { getWhatsAppEnv } from "../env";
import { mimeFromStorageKey, readPrivateMedia } from "../media";
import { aiWritableBriefFields, imageTargetFields, missingRequiredFields, type BriefDraft } from "./brief-schema";
import { buildStateBlock, buildSystemPrompt } from "./system-prompt";
import { ACTIVE_INTAKE_STATUSES } from "../intake";
import { INTAKE_TOOLS, executeTool, findActiveIntake } from "./tools";

// Satu giliran AI untuk satu pesan masuk (§10.3 langkah 7–8).

const HISTORY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 4;
const MAX_PENDING_IMAGES = 3;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: getWhatsAppEnv().ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 2 });
  return client;
}

export type AiTurnResult = {
  reply: string | null;
  intakeStatus: string | null;
  // Isi brief setelah giliran ini (untuk reply-guard)
  briefText: string;
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
  return row.body;
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

async function buildState(conversationId: string, pendingImageMessageIds: string[]) {
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
      deadline: true,
      service: { select: { code: true, name: true } },
    },
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
      clientName: intake.clientName,
      clientEmail: intake.clientEmail,
      briefDraft: draft,
      missingRequired: code ? missingRequiredFields(code, draft) : [],
      writableFields: code ? aiWritableBriefFields(code) : [],
      imageTargets: code ? imageTargetFields(code) : [],
      quote:
        intake.agreedPrice !== null && intake.dpAmount !== null && intake.deadline
          ? { agreedPrice: intake.agreedPrice, dpAmount: intake.dpAmount, deadline: intake.deadline }
          : null,
    },
    paymentAccounts,
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
  const env = getWhatsAppEnv();
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
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: buildSystemPrompt(studio.name), cache_control: { type: "ephemeral" } },
  ];

  const stateBlock = await buildState(params.conversationId, pendingImageIds);
  // STATE dikirim sebagai pesan system di akhir: kanal operator, terpisah dari teks klien.
  messages.push({ role: "system", content: stateBlock });

  const toolsCalled: string[] = [];
  const ctx = { conversationId: params.conversationId };

  for (let round = 0; ; round++) {
    const toolsAllowed = round < MAX_TOOL_ROUNDS;
    const response = await getClient().messages.create({
      model: env.WA_AI_MODEL,
      max_tokens: env.WA_AI_MAX_TOKENS,
      system,
      tools: INTAKE_TOOLS,
      tool_choice: toolsAllowed ? { type: "auto" } : { type: "none" },
      output_config: { effort: "low" },
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
