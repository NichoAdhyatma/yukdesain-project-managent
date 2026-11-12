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
2. Mencatat jawaban owner atas pertanyaan klien di luar katalog lewat answer_client_query, dan mengirim ulang jawaban yang belum terkirim lewat resend_client_answer.
3. Menjawab pertanyaan owner tentang panduan yang berlaku (lihat STATE).

# Menyusun usulan
- Satu-satunya cara membuat usulan adalah memanggil propose_guide_change. Jangan pernah menulis sendiri teks usulan, daftar perubahan, atau meminta owner membalas YA/BATAL; pesan konfirmasi dikirim sistem.
- propose_guide_change mengganti bagian yang kamu kirim secara utuh. Untuk menambah, salin isi lama dari STATE lalu tambahkan. Bagian yang tidak berubah jangan dikirim.
- Aturan tambahan: kalimat perintah yang jelas untuk bot, bahasa Indonesia, tanpa mengubah maksud owner. Pertahankan aturan lama kecuali owner memintanya dihapus atau diganti.
- Aturan harga hanya untuk potongan atau biaya tambahan dengan nilai pasti: kind DISCOUNT atau SURCHARGE; amountType FIXED (rupiah, angka bulat, mis. 50rb = 50000) atau PERCENT. condition = syarat dari owner. note = cara menyampaikan jika owner meminta (mis. "pakai kalimat promosi yang menarik"). Pertahankan id aturan yang sudah ada.
- Bot sudah otomatis bertanya ke owner untuk permintaan di luar katalog. Jika owner memberi instruksi soal itu, cukup tambahkan aturan tambahan yang menjelaskan kapan bot perlu bertanya.
- Jika nilai, syarat, atau maksud instruksi belum jelas, tanyakan dulu sebelum membuat usulan.
- Tidak bisa diubah lewat panduan: harga dan paket layanan (diatur di menu Layanan portal), bot menghitung total di luar kalkulator, menyebut nominal/persen DP, menyatakan DP valid, atau membahas topik di luar studio. Jika owner meminta itu, jelaskan singkat dan tawarkan alternatif (mis. aturan harga, atau ubah harga di menu Layanan).
- Harga khusus untuk satu klien bukan perubahan panduan: harga order klien itu diisi admin di Order WA portal. Jika berkaitan dengan pertanyaan klien yang menunggu, catat sebagai note di answer_client_query.

# Pertanyaan klien
- STATE berisi pertanyaan klien yang menunggu jawaban owner. Jika pesan owner menjawab salah satunya (ditandai di STATE jika owner membalas pesan pertanyaannya) atau jelas merujuk satu pertanyaan, panggil answer_client_query: approved=true untuk bisa, false untuk tidak; note = catatan owner untuk bot (harga khusus, syarat, layanan yang dipakai).
- Cocokkan isi jawaban owner dengan permintaan di STATE (mis. jawaban menyebut banner → pertanyaan soal banner).
- Jika ada beberapa pertanyaan terbuka dan owner tidak me-reply pesan pertanyaannya, jawaban hanya bisa dicatat bila pesan owner menyebut nama klien atau 4 digit akhir nomornya. Jangan menebak: minta owner menyebut nama klien atau me-reply pesan pertanyaannya, sambil menyebut daftar klien yang menunggu.
- Jangan mengingatkan pertanyaan klien lain yang masih menunggu di setiap balasan. Sebut hanya bila owner menanyakannya atau saat perlu memastikan jawaban ini untuk pertanyaan yang mana.
- Setelah answer_client_query berhasil, cukup bilang jawabannya sudah dicatat. Jangan menyatakan jawaban sudah terkirim ke klien: sistem yang mengirimnya lalu melaporkan hasilnya ke owner.
- Jangan bilang jawaban owner belum tersimpan atau belum terkirim bila jawaban itu tercantum di STATE sebagai sudah terkirim; hasil kirim selalu dilaporkan sistem ke owner.
- STATE juga berisi jawaban owner yang belum terkirim ke klien (mis. gagal dikirim karena AI error). Jika owner minta mengirim ulang, panggil resend_client_answer dengan id-nya; jika ada beberapa dan tidak jelas yang mana, tanyakan.

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
  resend_client_answer: z.object({ query_id: z.string().min(1) }),
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
  {
    name: "resend_client_answer",
    description: "Kirim ulang ke klien jawaban owner yang sudah dicatat tapi belum terkirim (id dari STATE bagian jawaban yang belum terkirim).",
    input_schema: {
      type: "object",
      properties: { query_id: { type: "string" } },
      required: ["query_id"],
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

const RECENTLY_RELAYED_HOURS = 2;

/** Jawaban owner yang baru terkirim ke klien, supaya AI tidak meragukan jawaban yang sudah dicatat. */
async function recentlyRelayedAnswers(owner: OwnerContext) {
  return prisma.waOwnerQuery.findMany({
    where: {
      status: "ANSWERED",
      relayedAt: { not: null },
      answeredAt: { gt: new Date(Date.now() - RECENTLY_RELAYED_HOURS * 3_600_000) },
      conversation: owner.target === "DRAFT" ? { waId: sandboxWaId(owner.user.id) } : { isSandbox: false },
    },
    orderBy: { answeredAt: "desc" },
    take: 5,
    select: { id: true, question: true, approved: true, conversation: { select: { waId: true, profileName: true } } },
  });
}

/** Jawaban owner yang sudah dicatat tapi belum sampai ke klien (24 jam terakhir). */
async function unrelayedAnswers(owner: OwnerContext) {
  return prisma.waOwnerQuery.findMany({
    where: {
      status: "ANSWERED",
      relayedAt: null,
      answeredAt: { gt: new Date(Date.now() - 24 * 3_600_000) },
      conversation: owner.target === "DRAFT" ? { waId: sandboxWaId(owner.user.id) } : { isSandbox: false },
    },
    orderBy: { answeredAt: "desc" },
    take: 10,
    select: { id: true, question: true, approved: true, relayFailedAt: true, conversation: { select: { waId: true, profileName: true } } },
  });
}

export function buildOwnerState(p: {
  owner: OwnerContext;
  current: GuideInEffect;
  pendingProposalSummary: string | null;
  queries: Awaited<ReturnType<typeof openQueries>>;
  unrelayed: Awaited<ReturnType<typeof unrelayedAnswers>>;
  recentlyRelayed: Awaited<ReturnType<typeof recentlyRelayedAnswers>>;
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
  if (p.unrelayed.length) {
    lines.push("- Jawaban owner yang belum terkirim ke klien:");
    for (const q of p.unrelayed) {
      const client = `${q.conversation.profileName ?? "Klien"} (${maskPhone(q.conversation.waId)})`;
      const state = q.relayFailedAt ? "gagal dikirim, bisa dikirim ulang" : "belum dikirim";
      lines.push(`  • id=${q.id}; klien: ${client}; permintaan: ${JSON.stringify(q.question)}; jawaban: ${q.approved ? "BISA" : "TIDAK"}; ${state}`);
    }
  }
  if (p.recentlyRelayed.length) {
    lines.push(`- Jawaban owner yang sudah terkirim ke klien (${RECENTLY_RELAYED_HOURS} jam terakhir):`);
    for (const q of p.recentlyRelayed) {
      const client = `${q.conversation.profileName ?? "Klien"} (${maskPhone(q.conversation.waId)})`;
      lines.push(`  • klien: ${client}; permintaan: ${JSON.stringify(q.question)}; jawaban: ${q.approved ? "BISA" : "TIDAK"}`);
    }
  }
  if (p.repliedQueryId) lines.push(`- Pesan terbaru owner adalah balasan (reply) untuk pertanyaan id=${p.repliedQueryId}.`);
  return lines.join("\n");
}

export type OwnerTurnResult = {
  reply: string | null;
  proposal: { id: string; guide: BotGuide; base: BotGuide; summary: string; baseVersion: number | null } | null;
  answeredQueryIds: string[];
  /** Jawaban yang diminta owner untuk dikirim ulang (resend_client_answer) */
  resendQueryIds: string[];
  /** Alasan berhenti respons terakhir model (untuk log saat balasan kosong) */
  stopReason: string | null;
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
  const [targets, studio, current, pending, queries, unrelayed, recentlyRelayed, history] = await Promise.all([
    getAiTargets(),
    getStudioSettings(),
    guideFor(p.owner),
    findPendingProposal(p.conversationId),
    openQueries(p.owner),
    unrelayedAnswers(p.owner),
    recentlyRelayedAnswers(p.owner),
    prisma.waMessage.findMany({
      where: { conversationId: p.conversationId, NOT: { direction: "OUTBOUND", deliveryStatus: "failed" } },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: { direction: true, body: true },
    }),
  ]);
  const chat = createChatSession(targets);
  const openClients = new Map(queries.map((q) => [q.id, q.conversation]));
  const unrelayedIds = new Set(unrelayed.map((q) => q.id));
  // history urut terbaru dulu: pesan owner terakhir dipakai untuk memastikan jawaban untuk klien yang mana.
  const ownerText = history.find((m) => m.direction === "INBOUND")?.body ?? "";
  const repliedQueryId = p.repliedQueryId && openClients.has(p.repliedQueryId) ? p.repliedQueryId : null;

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
        unrelayed,
        recentlyRelayed,
        repliedQueryId,
      }),
    },
  ];

  const result: OwnerTurnResult = { reply: null, proposal: null, answeredQueryIds: [], resendQueryIds: [], stopReason: null };

  for (let round = 0; ; round++) {
    const response = await chat.create({
      // Usulan membawa teks panduan lengkap (aturan + FAQ); batas kecil memotongnya jadi balasan kosong.
      max_tokens: Math.max(targets.maxTokens, 4000),
      system,
      tools: OWNER_TOOLS,
      tool_choice: round < MAX_TOOL_ROUNDS ? { type: "auto" } : { type: "none" },
      messages,
    });
    if (response.stop_reason === "refusal") throw new Error("AI_REFUSAL");
    result.stopReason = response.stop_reason ?? null;

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
      const outcome = await executeOwnerTool(use.name, use.input, { ...p, current, openQueries: openClients, unrelayedIds, ownerText, repliedQueryId, result });
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
  /** Pertanyaan terbuka di STATE → klien penanya */
  openQueries: Map<string, OpenQueryClient>;
  unrelayedIds: Set<string>;
  /** Pesan owner terbaru (untuk memastikan jawaban saat beberapa pertanyaan terbuka) */
  ownerText: string;
  /** Pertanyaan yang di-reply owner, bila ada */
  repliedQueryId: string | null;
  result: OwnerTurnResult;
};

type OpenQueryClient = { profileName: string | null; waId: string };

const NOT_WORD = "[^\\p{L}\\p{N}]";

/** Pesan owner menyebut klien ini: kata dari namanya (≥3 huruf), nama utuh, atau 4 digit akhir nomornya. */
export function mentionsClient(text: string, client: OpenQueryClient): boolean {
  const words = (client.profileName ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const whole = words.join(" ");
  const candidates = [...words.filter((w) => w.length >= 3), ...(whole.length >= 2 ? [whole] : []), client.waId.slice(-4)];
  const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return candidates.some((c) => new RegExp(`(^|${NOT_WORD})${escape(c)}($|${NOT_WORD})`, "iu").test(text));
}

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
    const client = ctx.openQueries.get(input.data.query_id);
    if (!client) return fail("Pertanyaan tidak ditemukan atau sudah dijawab");
    // Beberapa pertanyaan terbuka tanpa reply: jawaban tidak boleh ditebak (produksi 12 Nov 18:57).
    if (ctx.openQueries.size > 1 && ctx.repliedQueryId !== input.data.query_id && !mentionsClient(ctx.ownerText, client)) {
      return fail(
        "Ada beberapa pertanyaan terbuka dan pesan owner tidak menyebut klien ini. Jangan dicatat; tanyakan ke owner jawaban ini untuk klien yang mana (minta sebut nama klien atau reply pesan pertanyaannya).",
      );
    }
    const answered = await answerOwnerQuery(input.data.query_id, {
      approved: input.data.approved,
      note: input.data.note ?? null,
      answeredById: ctx.owner.user.id,
    });
    if (!answered) return fail("Pertanyaan sudah dijawab atau kedaluwarsa");
    ctx.result.answeredQueryIds.push(input.data.query_id);
    // Belum terkirim: sistem meneruskan ke klien setelah giliran ini dan melaporkan hasilnya ke owner.
    return ok({ recorded: true });
  }

  if (name === "resend_client_answer") {
    const input = inputs.resend_client_answer.safeParse(rawInput);
    if (!input.success) return fail("Input tidak valid");
    if (!ctx.unrelayedIds.has(input.data.query_id)) return fail("Jawaban tidak ditemukan atau sudah terkirim");
    ctx.result.resendQueryIds.push(input.data.query_id);
    return ok({ queued: true });
  }

  return fail(`Tool ${name} tidak tersedia`);
}
