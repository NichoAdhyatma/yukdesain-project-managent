import type { WaIntakeStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { describeRuleValue, getDraftGuide, getPublishedGuide, isGuideEmpty, sameGuide, type BotGuide } from "./bot-guide";
import { buildSystemPrompt } from "./system-prompt";
import { INTAKE_TOOLS } from "./tools";

// Otak bot (docs/WHATSAPP_BOT_BRAIN_VIEW.md): semua yang diketahui bot klien dalam satu tampilan untuk owner.
// Hanya membaca; teks prompt dibangun dengan buildSystemPrompt yang sama dengan bot.

export type BrainSource = "published" | "draft";

// Alur order dari sisi bot (docs/WHATSAPP_AI_CHATBOT.md §5). Label sama dengan Order WA.
export const BRAIN_FLOW: { status: WaIntakeStatus; label: string; actor: string; detail: string }[] = [
  {
    status: "COLLECTING",
    label: "Sedang konsultasi",
    actor: "Bot dan klien",
    detail: "Bot membantu memilih layanan, menggali brief satu-dua pertanyaan per pesan, lalu meminta klien mengonfirmasi ringkasan brief.",
  },
  {
    status: "AWAITING_QUOTE",
    label: "Perlu harga",
    actor: "Admin",
    detail: "Admin mengisi harga, DP, dan deadline di Order WA. Bot tidak menyebut harga atau lama pengerjaan.",
  },
  {
    status: "QUOTED",
    label: "Menunggu DP",
    actor: "Bot dan klien",
    detail: "Bot menyampaikan harga, DP, deadline, dan rekening persis seperti diisi admin, lalu meminta bukti transfer.",
  },
  {
    status: "DP_REVIEW",
    label: "Verifikasi DP",
    actor: "Admin",
    detail: "Admin memeriksa bukti transfer. Bot hanya menyampaikan bahwa bukti sedang dicek, tidak pernah menyatakan DP valid.",
  },
  {
    status: "APPROVED",
    label: "Jadi project",
    actor: "Admin",
    detail: "Admin menyetujui DP dan order menjadi project. Setelah itu bot bisa menjawab status project milik klien.",
  },
  {
    status: "CANCELLED",
    label: "Batal",
    actor: "Klien atau admin",
    detail: "Klien membatalkan lewat chat (bot meminta konfirmasi dulu) atau admin membatalkan dari Order WA.",
  },
];

// Label untuk owner per tool bot. Tes memastikan setiap tool punya label.
export const CAPABILITY_LABELS: Record<string, { label: string; detail: string }> = {
  list_services: { label: "Melihat daftar layanan", detail: "Membaca layanan aktif dari menu Services." },
  start_intake: { label: "Memulai order", detail: "Membuat order baru untuk layanan yang dipilih klien." },
  update_brief_draft: { label: "Mengisi brief", detail: "Menyimpan jawaban klien ke field brief layanan." },
  attach_image_to_brief: { label: "Melampirkan gambar ke brief", detail: "Logo atau referensi dari klien disimpan ke brief." },
  set_client_profile: { label: "Mencatat nama dan email klien", detail: "Dipakai saat order menjadi project." },
  confirm_brief: { label: "Mengonfirmasi brief", detail: "Hanya setelah klien setuju; order lalu menunggu harga dari admin." },
  submit_payment_proof: { label: "Meneruskan bukti transfer", detail: "Bukti DP diteruskan ke admin untuk dicek." },
  cancel_intake: { label: "Membatalkan order", detail: "Setelah klien mengonfirmasi pembatalan." },
  get_my_projects: { label: "Melihat project klien", detail: "Ringkasan project milik nomor yang sedang chat." },
  get_project_by_code: { label: "Melihat detail project", detail: "Progres satu project berdasarkan kodenya." },
  get_studio_info: { label: "Membaca identitas studio", detail: "Nama, email, telepon, dan alamat studio." },
  ask_owner: { label: "Bertanya ke owner", detail: "Untuk permintaan di luar daftar layanan; jawaban owner diteruskan ke klien." },
  apply_pricing_rule: { label: "Menandai aturan harga", detail: "Mencatat potongan atau biaya tambahan yang berlaku untuk order." },
  request_human_handoff: { label: "Mengalihkan ke admin", detail: "Saat klien minta admin, menawar harga, atau bot tidak bisa membantu." },
};

/** Pecah aturan dasar menjadi bagian per heading "# …". Paragraf pembuka menjadi bagian "Peran". */
export function splitBaseRules(rules: string): { title: string; text: string }[] {
  const sections: { title: string; text: string }[] = [];
  const parts = rules.split(/^# (.+)$/m);
  const intro = parts[0].trim();
  if (intro) sections.push({ title: "Peran", text: intro });
  for (let i = 1; i < parts.length; i += 2) {
    sections.push({ title: parts[i].trim(), text: (parts[i + 1] ?? "").trim() });
  }
  return sections;
}

// Perkiraan kasar untuk teks Indonesia; ditampilkan dengan tanda ± di UI.
const approxTokens = (chars: number) => Math.round(chars / 4 / 100) * 100;

const changedSections = (draft: BotGuide, published: BotGuide | null) => {
  const base = published ?? { instructions: "", faqs: [], pricingRules: [], knowledgeFiles: [] };
  const diff = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  return {
    instructions: diff(draft.instructions, base.instructions),
    knowledgeFiles: diff(draft.knowledgeFiles, base.knowledgeFiles),
    faqs: diff(draft.faqs, base.faqs),
    pricingRules: diff(draft.pricingRules, base.pricingRules),
  };
};

export async function buildBrain(source: BrainSource) {
  const [settings, services, draft, published] = await Promise.all([
    prisma.studioSettings.findUnique({
      where: { id: "default" },
      select: { name: true, email: true, phone: true, address: true },
    }),
    prisma.service.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { name: true, description: true, outputFormat: true },
    }),
    getDraftGuide(),
    getPublishedGuide(),
  ]);

  const studioName = settings?.name ?? "YukDesain Studio";
  const guide = source === "draft" ? draft : (published?.guide ?? null);
  const baseRules = buildSystemPrompt(studioName, null);
  const promptText = buildSystemPrompt(studioName, guide);
  // Definisi tools ikut dikirim di setiap request, jadi dihitung dalam ukuran.
  const toolChars = JSON.stringify(INTAKE_TOOLS).length;

  return {
    source,
    published: published && { version: published.version, publishedAt: published.publishedAt },
    draftDiffers: published ? !sameGuide(draft, published.guide) : !isGuideEmpty(draft),
    studio: {
      name: studioName,
      email: settings?.email ?? "",
      phone: settings?.phone ?? "",
      address: settings?.address ?? "",
    },
    services: services.map((s) => ({ name: s.name, description: s.description ?? "", outputFormat: s.outputFormat ?? "" })),
    pricingRules: (guide?.pricingRules ?? []).map((r) => ({
      name: r.name,
      value: describeRuleValue(r),
      condition: r.condition,
      note: r.note,
    })),
    flow: BRAIN_FLOW,
    baseRules: splitBaseRules(baseRules),
    guide: {
      instructions: guide?.instructions ?? "",
      knowledgeFiles: guide?.knowledgeFiles ?? [],
      faqs: guide?.faqs ?? [],
      changed: changedSections(draft, published?.guide ?? null),
    },
    capabilities: INTAKE_TOOLS.map((t) => ({
      name: t.name,
      label: CAPABILITY_LABELS[t.name]?.label ?? t.name,
      detail: CAPABILITY_LABELS[t.name]?.detail ?? "",
    })),
    prompt: {
      text: promptText,
      chars: promptText.length,
      toolChars,
      approxTokens: approxTokens(promptText.length + toolChars),
    },
  };
}

export type BotBrain = Awaited<ReturnType<typeof buildBrain>>;
