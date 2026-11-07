// Model tampilan Otak bot (docs/BOT_AI_PAGE.md §3): satu struktur untuk mind map (layar lebar) dan pohon
// (layar kecil), supaya kedua tampilan selalu berisi hal yang sama.

export type BrainSource = "published" | "draft";

export type Brain = {
  source: BrainSource;
  published: { version: number; publishedAt: string } | null;
  draftDiffers: boolean;
  studio: { name: string; email: string; phone: string; address: string };
  services: { name: string; description: string; outputFormat: string }[];
  pricingRules: { name: string; value: string; condition: string; note: string }[];
  flow: { status: string; label: string; actor: string; detail: string }[];
  baseRules: { title: string; text: string }[];
  guide: {
    instructions: string;
    knowledgeFiles: { title: string; whenToUse: string; content: string }[];
    faqs: { question: string; answer: string }[];
    changed: { instructions: boolean; knowledgeFiles: boolean; faqs: boolean; pricingRules: boolean };
  };
  capabilities: { name: string; label: string; detail: string }[];
  prompt: { text: string; chars: number; toolChars: number; approxTokens: number };
};

export type BranchId = "studio" | "services" | "pricing" | "flow" | "rules" | "guide" | "capabilities";
/** Bagian Panduan bot yang bisa dituju tombol Ubah (anchor wa-guide-section-<id>). */
export type GuideSection = "instructions" | "knowledge" | "faq" | "pricing";
export type EditTarget = { kind: "link"; href: string; label: string } | { kind: "guide"; section: GuideSection; label: string };

export type MapItem = {
  id: string;
  title: string;
  subtitle?: string;
  /** Isi lengkap yang tampil di panel detail. */
  body?: string;
  /** body berisi Markdown (dirender), bukan teks biasa. */
  markdown?: boolean;
  /** Kelompok di dalam cabang (dipakai cabang Panduan owner). */
  group?: GuideSection;
};

export type MapGroup = { id: GuideSection; title: string; meta: string; note: string | null; edit: EditTarget };

export type MapBranch = {
  id: BranchId;
  title: string;
  side: "left" | "right";
  meta: string;
  locked: boolean;
  note: string | null;
  intro?: string;
  emptyText: string;
  edit?: EditTarget;
  items: MapItem[];
  groups?: MapGroup[];
};

/** Jumlah item yang tampil langsung di mind map; sisanya "+N lainnya". */
export const MAP_VISIBLE_ITEMS = 4;

const fmt = (n: number) => n.toLocaleString("id-ID");

export function visibleItems(branch: MapBranch): { shown: MapItem[]; hidden: number } {
  return { shown: branch.items.slice(0, MAP_VISIBLE_ITEMS), hidden: Math.max(0, branch.items.length - MAP_VISIBLE_ITEMS) };
}

export function buildBrainMap(brain: Brain): MapBranch[] {
  const { guide, studio } = brain;
  const isDraft = brain.source === "draft";
  // Dilihat dari versi terbit → ada perubahan di draft; dilihat dari draft → belum terbit.
  const note = (changed: boolean) => (changed ? (isDraft ? "Belum terbit" : "Ada perubahan di draft") : null);

  const studioFields: [string, string][] = [
    ["Nama", studio.name],
    ["Email", studio.email],
    ["Telepon", studio.phone],
    ["Alamat", studio.address],
  ];

  const guideItems: MapItem[] = [
    ...(guide.instructions
      ? [{ id: "instructions", title: "Aturan tambahan", subtitle: `${fmt(guide.instructions.length)} karakter`, body: guide.instructions, markdown: true, group: "instructions" as const }]
      : []),
    ...guide.knowledgeFiles.map((f, i) => ({
      id: `file-${i}`,
      title: f.title,
      subtitle: `${f.whenToUse ? `Dipakai saat: ${f.whenToUse} · ` : ""}${fmt(f.content.length)} karakter`,
      body: f.content,
      markdown: true,
      group: "knowledge" as const,
    })),
    ...guide.faqs.map((f, i) => ({ id: `faq-${i}`, title: f.question, body: f.answer, group: "faq" as const })),
  ];

  return [
    {
      id: "studio",
      title: "Identitas studio",
      side: "left",
      meta: `${studioFields.filter(([, v]) => v).length} info`,
      locked: false,
      note: null,
      emptyText: "",
      edit: { kind: "link", href: "/settings?tab=general", label: "identitas studio di Settings General" },
      items: studioFields.map(([label, value]) => ({ id: label, title: label, subtitle: value || "Belum diisi" })),
    },
    {
      id: "services",
      title: "Layanan",
      side: "left",
      meta: `${brain.services.length} aktif`,
      locked: false,
      note: null,
      emptyText: "Belum ada layanan aktif, jadi bot tidak bisa memulai order.",
      edit: { kind: "link", href: "/services", label: "layanan di menu Services" },
      items: brain.services.map((s) => ({
        id: s.name,
        title: s.name,
        subtitle: s.outputFormat || undefined,
        body: s.description || undefined,
      })),
    },
    {
      id: "pricing",
      title: "Harga",
      side: "left",
      meta: `${brain.pricingRules.length} aturan`,
      locked: false,
      note: note(guide.changed.pricingRules),
      intro:
        "Bot tidak memegang daftar harga. Harga, DP, dan deadline diisi admin per order di Order WA; bot hanya menyampaikannya. Yang boleh disebut bot sebelum penawaran hanya aturan harga berikut.",
      emptyText: "Belum ada aturan harga.",
      edit: { kind: "guide", section: "pricing", label: "aturan harga" },
      items: brain.pricingRules.map((r) => ({
        id: r.name,
        title: `${r.name}: ${r.value}`,
        subtitle: `Syarat: ${r.condition}`,
        body: r.note ? `Cara menyampaikan: ${r.note}` : undefined,
      })),
    },
    {
      id: "flow",
      title: "Alur order",
      side: "left",
      meta: `${brain.flow.length} tahap`,
      locked: true,
      note: null,
      emptyText: "",
      items: brain.flow.map((s, i) => ({ id: s.status, title: `${i + 1}. ${s.label}`, subtitle: s.actor, body: s.detail })),
    },
    {
      id: "rules",
      title: "Aturan dasar",
      side: "right",
      meta: `${brain.baseRules.length} bagian`,
      locked: true,
      note: null,
      intro: "Ditulis di sistem dan tidak bisa diubah dari portal. Panduan owner berlaku selama tidak bertentangan dengan aturan ini.",
      emptyText: "",
      items: brain.baseRules.map((r) => ({ id: r.title, title: r.title, body: r.text, markdown: true })),
    },
    {
      id: "guide",
      title: "Panduan owner",
      side: "right",
      meta: `${guideItems.length + brain.pricingRules.length} isi`,
      locked: false,
      note: note(Object.values(guide.changed).some(Boolean)),
      emptyText: "Panduan masih kosong.",
      edit: { kind: "guide", section: "instructions", label: "panduan" },
      items: guideItems,
      groups: [
        {
          id: "instructions",
          title: "Aturan tambahan",
          meta: guide.instructions ? `${fmt(guide.instructions.length)} karakter` : "kosong",
          note: note(guide.changed.instructions),
          edit: { kind: "guide", section: "instructions", label: "aturan tambahan" },
        },
        {
          id: "knowledge",
          title: "File pengetahuan",
          meta: `${guide.knowledgeFiles.length} file`,
          note: note(guide.changed.knowledgeFiles),
          edit: { kind: "guide", section: "knowledge", label: "file pengetahuan" },
        },
        {
          id: "faq",
          title: "FAQ",
          meta: `${guide.faqs.length} pertanyaan`,
          note: note(guide.changed.faqs),
          edit: { kind: "guide", section: "faq", label: "FAQ" },
        },
      ],
    },
    {
      id: "capabilities",
      title: "Kemampuan",
      side: "right",
      meta: `${brain.capabilities.length} hal`,
      locked: true,
      note: null,
      emptyText: "",
      items: brain.capabilities.map((c) => ({ id: c.name, title: c.label, subtitle: c.detail })),
    },
  ];
}
