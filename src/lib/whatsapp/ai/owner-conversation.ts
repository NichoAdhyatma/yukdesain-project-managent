import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStudioSettings } from "@/lib/studio";
import { maskPhone } from "../phone";
import { getAiTargets } from "./ai-config";
import { createChatSession } from "@/lib/ai/fallback";
import { EMPTY_GUIDE, botGuideSchema, describeRuleValue, getDraftGuide, getPublishedGuide, type BotGuide } from "./bot-guide";
import { createProposal, findPendingProposal, isNoChange } from "../owner/proposals";
import { answerOwnerQuery } from "../owner/query-store";
import { sandboxWaId, type OwnerContext } from "../owner/identity";

// Percakapan owner ↔ bot (docs/WHATSAPP_OWNER_COMMANDS.md §4–5). Terpisah dari percakapan
// klien: prompt, STATE, dan tools sendiri. AI hanya membuat usulan; penerapannya lewat YA
// yang diperiksa server.

const HISTORY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 3;

export function buildOwnerSystemPrompt(studioName: string): string {
  return `Kamu asisten pengaturan bot WhatsApp ${studioName}. Lawan bicaramu adalah OWNER studio, bukan klien.

# Tugas
1. Mengubah instruksi owner menjadi panduan tertulis untuk bot lewat propose_guide_change: aturan tambahan, FAQ, atau aturan harga. Perubahan baru berlaku setelah owner membalas YA; itu diurus sistem, jadi setelah membuat usulan kamu tidak perlu menulis apa pun lagi.
2. Meneruskan jawaban owner atas pertanyaan klien di luar katalog lewat answer_client_query.
3. Menjawab pertanyaan owner tentang panduan yang berlaku (lihat STATE).

# Menyusun usulan
- Satu-satunya cara membuat usulan adalah memanggil propose_guide_change. Jangan pernah menulis sendiri teks usulan, daftar perubahan, atau meminta owner membalas YA/BATAL; pesan konfirmasi dikirim sistem.
- propose_guide_change mengganti bagian yang kamu kirim secara utuh. Untuk menambah, salin isi lama dari STATE lalu tambahkan. Bagian yang tidak berubah jangan dikirim.
- Aturan tambahan: kalimat perintah yang jelas untuk bot, bahasa Indonesia, tanpa mengubah maksud owner. Pertahankan aturan lama kecuali owner memintanya dihapus atau diganti.
- Aturan harga hanya untuk potongan atau biaya tambahan dengan nilai pasti: kind DISCOUNT atau SURCHARGE; amountType FIXED (rupiah, angka bulat, mis. 50rb = 50000) atau PERCENT. condition = syarat dari owner. note = cara menyampaikan jika owner meminta (mis. "pakai kalimat promosi yang menarik"). Pertahankan id aturan yang sudah ada.
- Bot sudah otomatis bertanya ke owner untuk permintaan di luar katalog. Jika owner memberi instruksi soal itu, cukup tambahkan aturan tambahan yang menjelaskan kapan bot perlu bertanya.
- Jika nilai, syarat, atau maksud instruksi belum jelas, tanyakan dulu sebelum membuat usulan.
- Tidak bisa diubah lewat panduan: bot tidak menyebut harga layanan, kisaran harga, atau total sebelum tim mengirim penawaran; tidak menyatakan DP valid; tidak membahas topik di luar studio. Jika owner meminta itu, jelaskan singkat dan tawarkan alternatif (mis. aturan harga).

# Pertanyaan klien
- STATE berisi pertanyaan klien yang menunggu jawaban owner. Jika pesan owner menjawab salah satunya (ditandai di STATE jika owner membalas pesan pertanyaannya) atau jelas merujuk satu pertanyaan, panggil answer_client_query: approved=true untuk bisa, false untuk tidak; note = catatan owner untuk bot (harga khusus, syarat, layanan yang dipakai).
- Jika ada beberapa pertanyaan terbuka dan tidak jelas yang mana, tanyakan.
- Setelah answer_client_query berhasil, konfirmasi singkat ke owner bahwa jawabannya diteruskan ke klien.

# Gaya
Bahasa Indonesia santai dan singkat. Format WhatsApp (*tebal*, _miring_), tanpa Markdown lain dan tanpa tabel.`;
}

const ruleInput = z.object({
  id: z.string().optional(),
  kind: z.enum(["DISCOUNT", "SURCHARGE"]),
  name: z.string(),
  condition: z.string(),
  amountType: z.enum(["FIXED", "PERCENT"]),
  amount: z.number(),
  note: z.string().optional(),
});

const inputs = {
  propose_guide_change: z.object({
    summary: z.string().trim().min(1).max(600),
    instructions: z.string().optional(),
    faqs: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
    pricing_rules: z.array(ruleInput).optional(),
  }),
  answer_client_query: z.object({
    query_id: z.string().min(1),
    approved: z.boolean(),
    note: z.string().trim().max(1000).optional(),
  }),
};

export const OWNER_TOOLS: Anthropic.Tool[] = [
  {
    name: "propose_guide_change",
    description:
      "Buat usulan perubahan panduan bot dari instruksi owner. Bagian yang dikirim mengganti isi lama secara utuh; bagian yang tidak dikirim tetap. Owner lalu diminta membalas YA/BATAL oleh sistem.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Ringkasan perubahan untuk owner, 1-3 kalimat" },
        instructions: { type: "string", description: "Teks lengkap aturan tambahan setelah perubahan" },
        faqs: {
          type: "array",
          description: "Daftar lengkap FAQ setelah perubahan",
          items: {
            type: "object",
            properties: { question: { type: "string" }, answer: { type: "string" } },
            required: ["question", "answer"],
          },
        },
        pricing_rules: {
          type: "array",
          description: "Daftar lengkap aturan harga setelah perubahan",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "id aturan lama (biarkan kosong untuk aturan baru)" },
              kind: { type: "string", enum: ["DISCOUNT", "SURCHARGE"] },
              name: { type: "string", description: "Nama singkat, mis. Diskon order >5 pcs" },
              condition: { type: "string", description: "Syarat berlaku, mis. jumlah desain lebih dari 5 pcs" },
              amountType: { type: "string", enum: ["FIXED", "PERCENT"] },
              amount: { type: "integer", description: "Rupiah (FIXED) atau persen (PERCENT)" },
              note: { type: "string", description: "Cara menyampaikan ke klien, opsional" },
            },
            required: ["kind", "name", "condition", "amountType", "amount"],
          },
        },
      },
      required: ["summary"],
      additionalProperties: false,
    },
  },
  {
    name: "answer_client_query",
    description: "Teruskan jawaban owner untuk satu pertanyaan klien di luar katalog (id dari STATE).",
    input_schema: {
      type: "object",
      properties: {
        query_id: { type: "string" },
        approved: { type: "boolean", description: "true = bisa dikerjakan, false = tidak" },
        note: { type: "string", description: "Catatan owner untuk bot, opsional" },
      },
      required: ["query_id", "approved"],
      additionalProperties: false,
    },
  },
];

type GuideInEffect = { guide: BotGuide; version: number | null };

async function guideFor(owner: OwnerContext): Promise<GuideInEffect> {
  if (owner.target === "DRAFT") return { guide: await getDraftGuide(), version: null };
  const published = await getPublishedGuide();
  return { guide: published?.guide ?? EMPTY_GUIDE, version: published?.version ?? null };
}

async function openQueries(owner: OwnerContext) {
  // Owner Uji bot hanya melihat pertanyaan dari percakapan uji; owner WA hanya pertanyaan klien sungguhan.
  return prisma.waOwnerQuery.findMany({
    where: {
      status: "PENDING",
      conversation: owner.target === "DRAFT" ? { waId: sandboxWaId(owner.user.id) } : { isSandbox: false },
    },
    orderBy: { createdAt: "asc" },
    take: 10,
    select: { id: true, question: true, createdAt: true, conversation: { select: { waId: true, profileName: true } } },
  });
}

export function buildOwnerState(p: {
  owner: OwnerContext;
  current: GuideInEffect;
  pendingProposalSummary: string | null;
  queries: Awaited<ReturnType<typeof openQueries>>;
  repliedQueryId: string | null;
}): string {
  const { guide } = p.current;
  const lines = [
    "STATE (dari sistem):",
    `- Owner: ${p.owner.user.name}`,
    p.owner.target === "DRAFT"
      ? "- Mode Uji bot: usulan yang disetujui masuk ke draft, belum ke klien."
      : `- Panduan aktif: ${p.current.version ? `versi ${p.current.version}` : "belum ada"}`,
    `- Aturan tambahan saat ini: ${guide.instructions ? JSON.stringify(guide.instructions) : "(kosong)"}`,
    `- FAQ saat ini: ${guide.faqs.length ? JSON.stringify(guide.faqs) : "(kosong)"}`,
    `- Aturan harga saat ini: ${
      guide.pricingRules.length
        ? JSON.stringify(guide.pricingRules.map((r) => ({ ...r, ringkas: describeRuleValue(r) })))
        : "(kosong)"
    }`,
  ];
  if (p.pendingProposalSummary) {
    lines.push(`- Ada usulan yang menunggu YA/BATAL dari owner: ${JSON.stringify(p.pendingProposalSummary)}. Usulan baru akan menggantikannya.`);
  }
  if (p.queries.length) {
    lines.push("- Pertanyaan klien yang menunggu jawaban owner:");
    for (const q of p.queries) {
      const client = `${q.conversation.profileName ?? "Klien"} (${maskPhone(q.conversation.waId)})`;
      lines.push(`  • id=${q.id}; klien: ${client}; permintaan: ${JSON.stringify(q.question)}`);
    }
  } else {
    lines.push("- Tidak ada pertanyaan klien yang menunggu.");
  }
  if (p.repliedQueryId) lines.push(`- Pesan terbaru owner adalah balasan (reply) untuk pertanyaan id=${p.repliedQueryId}.`);
  return lines.join("\n");
}

export type OwnerTurnResult = {
  reply: string | null;
  proposal: { id: string; guide: BotGuide; base: BotGuide; summary: string; baseVersion: number | null } | null;
  answeredQueryIds: string[];
};

/**
 * Satu giliran AI untuk pesan owner. Melempar error jika API gagal; pemanggil yang
 * menangani fallback.
 */
export async function runOwnerAiTurn(p: {
  owner: OwnerContext;
  conversationId: string;
  repliedQueryId: string | null;
}): Promise<OwnerTurnResult> {
  const [targets, studio, current, pending, queries, history] = await Promise.all([
    getAiTargets(),
    getStudioSettings(),
    guideFor(p.owner),
    findPendingProposal(p.conversationId),
    openQueries(p.owner),
    prisma.waMessage.findMany({
      where: { conversationId: p.conversationId, NOT: { direction: "OUTBOUND", deliveryStatus: "failed" } },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: { direction: true, body: true },
    }),
  ]);
  const chat = createChatSession(targets);
  const openIds = new Set(queries.map((q) => q.id));

  const messages: Anthropic.MessageParam[] = history
    .reverse()
    .map((m) => ({ role: m.direction === "INBOUND" ? ("user" as const) : ("assistant" as const), content: m.body || "-" }));
  while (messages[0]?.role === "assistant") messages.shift();

  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: buildOwnerSystemPrompt(studio.name), cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: buildOwnerState({
        owner: p.owner,
        current,
        pendingProposalSummary: pending?.summary ?? null,
        queries,
        repliedQueryId: p.repliedQueryId && openIds.has(p.repliedQueryId) ? p.repliedQueryId : null,
      }),
    },
  ];

  const result: OwnerTurnResult = { reply: null, proposal: null, answeredQueryIds: [] };

  for (let round = 0; ; round++) {
    const response = await chat.create({
      max_tokens: Math.max(targets.maxTokens, 1500),
      system,
      tools: OWNER_TOOLS,
      tool_choice: round < MAX_TOOL_ROUNDS ? { type: "auto" } : { type: "none" },
      messages,
    });
    if (response.stop_reason === "refusal") throw new Error("AI_REFUSAL");

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      result.reply =
        response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim() || null;
      return result;
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const outcome = await executeOwnerTool(use.name, use.input, { ...p, current, openIds, result });
      results.push({ type: "tool_result", tool_use_id: use.id, content: outcome.content, is_error: outcome.isError });
    }
    messages.push({ role: "user", content: results });
    // Usulan dibuat → pesan konfirmasi dari server, tidak perlu teks lanjutan dari AI.
    if (result.proposal) return result;
  }
}

type OwnerToolContext = {
  owner: OwnerContext;
  conversationId: string;
  current: GuideInEffect;
  openIds: Set<string>;
  result: OwnerTurnResult;
};

const ok = (data: unknown) => ({ content: JSON.stringify(data), isError: false });
const fail = (message: string, details?: unknown) => ({
  content: JSON.stringify(details ? { error: message, details } : { error: message }),
  isError: true,
});

export async function executeOwnerTool(name: string, rawInput: unknown, ctx: OwnerToolContext) {
  if (name === "propose_guide_change") {
    const input = inputs.propose_guide_change.safeParse(rawInput);
    if (!input.success) return fail("Input tidak valid");
    const { instructions, faqs, pricing_rules } = input.data;
    const base = ctx.current.guide;
    const parsed = botGuideSchema.safeParse({
      instructions: instructions ?? base.instructions,
      faqs: faqs ?? base.faqs,
      pricingRules: pricing_rules ?? base.pricingRules,
      // File pengetahuan hanya diubah dari portal; usulan WhatsApp membawanya apa adanya.
      knowledgeFiles: base.knowledgeFiles,
    });
    if (!parsed.success) {
      return fail(
        "Usulan tidak valid; perbaiki lalu panggil lagi",
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      );
    }
    if (isNoChange(parsed.data, base)) return fail("Tidak ada perubahan dibanding panduan saat ini");
    const created = await createProposal({
      owner: ctx.owner,
      conversationId: ctx.conversationId,
      guide: parsed.data,
      summary: input.data.summary,
      baseVersion: ctx.current.version,
    });
    ctx.result.proposal = { id: created.id, guide: parsed.data, base, summary: input.data.summary, baseVersion: ctx.current.version };
    return ok({ proposed: true });
  }

  if (name === "answer_client_query") {
    const input = inputs.answer_client_query.safeParse(rawInput);
    if (!input.success) return fail("Input tidak valid");
    if (!ctx.openIds.has(input.data.query_id)) return fail("Pertanyaan tidak ditemukan atau sudah dijawab");
    const answered = await answerOwnerQuery(input.data.query_id, {
      approved: input.data.approved,
      note: input.data.note ?? null,
      answeredById: ctx.owner.user.id,
    });
    if (!answered) return fail("Pertanyaan sudah dijawab atau kedaluwarsa");
    ctx.result.answeredQueryIds.push(input.data.query_id);
    return ok({ forwarded: true });
  }

  return fail(`Tool ${name} tidak tersedia`);
}
