import { prisma } from "@/lib/db";
import { calculatePrice } from "@/lib/services/price-calculator";
import { getStudioOperations } from "@/lib/studio-operations";
import { formatWorkingHours, type StudioOperations } from "@/lib/studio-operations-rules";
import { describeRuleValue, getDraftGuide, getPublishedGuide, type BotGuide } from "./ai/bot-guide";
import { BOT_SERVICE_SELECT, toBotService, type BotService } from "./ai/service-catalog";
import { formatRupiah, formatTanggal } from "./format";

// Knowledge .md untuk Agen AI Kirimi (docs/WHATSAPP_CHANNEL_KIRIMI.md "Knowledge untuk Agen AI Kirimi"). Agen Kirimi
// tidak punya pengaman bot portal (kalkulator, penjaga harga/DP, ask_owner), jadi aturannya ditulis eksplisit di sini.
// Tidak memuat nomor rekening, link QRIS, persen DP, kunci, atau data klien.

export type KnowledgeSource = "published" | "draft";

export type KirimiKnowledgeInput = {
  source: KnowledgeSource;
  /** Versi Panduan terbit; null = belum pernah terbit / sumber draft */
  version: number | null;
  generatedAt: Date;
  studio: { name: string; email: string; phone: string; address: string };
  ops: StudioOperations;
  services: (BotService & { isActive: boolean })[];
  guide: BotGuide | null;
};

const MANDATORY_RULES = [
  "Jawab dalam bahasa Indonesia yang ramah dan singkat, sapa klien dengan \"Kak\". Jangan menanyakan ulang informasi yang sudah diberikan klien.",
  "Sebut harga hanya persis seperti di Katalog layanan. Harga pasti disebut tanpa kata \"mulai\"; harga bertanda \"mulai\" selalu dengan kata \"mulai\" dan keterangan bahwa harga final dikirim tim setelah brief.",
  "Hitungan jumlah (item, halaman, varian, pose) hanya memakai rumus di katalog. Jika jumlahnya kira-kira (\"40an item\"), tanyakan angka pastinya dulu.",
  "Pesanan gabungan beberapa layanan, diskon, atau express: jangan dihitung sendiri. Catat kebutuhannya dan sampaikan bahwa akan dikonfirmasi ke owner, lalu teruskan ke admin.",
  "Jangan menyebut nominal atau persen DP. Invoice dan metode pembayaran (termasuk QRIS) dikirim oleh tim setelah harga order dikonfirmasi.",
  "Jangan mengirim nomor rekening, gambar QRIS, atau kode pembayaran sendiri.",
  "Jangan menyatakan pembayaran sudah valid, diterima, atau masuk. Bukti transfer diteruskan ke tim untuk dicek.",
  "Jangan menyatakan order sudah terdaftar, masuk antrean, atau mulai dikerjakan sebelum dikonfirmasi tim. Jangan menjanjikan tanggal selesai.",
  "Lama pengerjaan hanya boleh disebut persis seperti estimasi di katalog.",
  "Jika klien mengirim link/file (Google Drive, Sheet, PDF), konfirmasi sudah diterima dan akan diteruskan ke owner. Jangan mengaku sudah membuka atau menghitung isinya.",
  "Layanan, harga, atau ketentuan yang tidak ada di dokumen ini: jangan menebak. Sampaikan akan ditanyakan ke owner, lalu teruskan ke admin.",
];

/** Jumlah unit untuk contoh hitungan: batas termasuk / minimal, satu di atasnya, dan beberapa di atasnya. */
function exampleUnits(unit: NonNullable<BotService["unitPricing"]>): number[] {
  const base = Math.max(unit.minUnits ?? 1, unit.includedUnits || 1);
  return [...new Set([base, base + 1, base + 5])];
}

function renderService(s: BotService & { isActive: boolean }, source: KnowledgeSource): string[] {
  const title = !s.isActive && source === "draft" ? `${s.name} (nonaktif di portal, jangan ditawarkan)` : s.name;
  const lines = [`### ${title}`];
  if (s.description) lines.push(s.description);
  const mulai = s.priceMode === "STARTING" ? "mulai " : "";
  const note = s.priceNote ? ` (${s.priceNote})` : "";
  const unit = s.unitPricing;

  if (s.packages.length) {
    for (const p of s.packages) lines.push(`- Paket ${p.name}: ${mulai}${formatRupiah(p.price)}${p.note ? ` (${p.note})` : ""}`);
    if (s.priceNote) lines.push(`- Catatan harga: ${s.priceNote}`);
  } else if (unit) {
    const rule = s.startingPrice
      ? `${mulai}${formatRupiah(s.startingPrice)} sudah termasuk ${unit.includedUnits} ${unit.unitLabel}; tambahan ${formatRupiah(unit.extraUnitPrice)} per ${unit.unitLabel} berikutnya`
      : `${mulai}${formatRupiah(unit.extraUnitPrice)} per ${unit.unitLabel}`;
    lines.push(`- Harga: ${rule}${unit.minUnits ? `, minimal ${unit.minUnits} ${unit.unitLabel}` : ""}${note}`);
  } else if (s.startingPrice) {
    lines.push(`- Harga: ${mulai}${formatRupiah(s.startingPrice)}${note}`);
  } else {
    lines.push("- Harga: belum ada di katalog, teruskan ke admin");
  }

  if (unit) {
    // Contoh dihitung kalkulator portal supaya agen tidak menghitung sendiri.
    const examples = exampleUnits(unit)
      .map((n) => ({ n, r: calculatePrice(s, { units: n, packageName: s.packages[0]?.name }) }))
      .filter((e) => e.r.ok)
      .map((e) => `${e.n} ${unit.unitLabel} = ${formatRupiah((e.r as { total: number }).total)}`);
    if (examples.length && !s.packages.length) lines.push(`- Contoh hitungan: ${examples.join("; ")}`);
  }
  if (s.estimate) lines.push(`- Estimasi: ${s.estimate}`);
  if (s.outputFormat) lines.push(`- Format file: ${s.outputFormat}`);
  if (s.suitableFor) lines.push(`- Cocok untuk: ${s.suitableFor}`);
  if (s.botNotes) lines.push(`- Catatan internal (jangan dikutip ke klien): ${s.botNotes}`);
  return lines;
}

export function buildKirimiKnowledge(input: KirimiKnowledgeInput): string {
  const { studio, ops, guide, source } = input;
  const sourceText = source === "draft" ? "Panduan draft" : input.version ? `Panduan terbit v${input.version}` : "Panduan terbit (belum ada versi)";
  const services = input.services.filter((s) => s.isActive || source === "draft");
  const contact = [studio.email && `email ${studio.email}`, studio.phone && `telepon ${studio.phone}`, studio.address && `alamat ${studio.address}`]
    .filter(Boolean)
    .join(", ");

  const out = [
    `# Knowledge agen WhatsApp ${studio.name}`,
    "",
    `Sumber: ${sourceText}, katalog Layanan portal. Dibuat ${formatTanggal(input.generatedAt)}. Buat ulang dari portal setiap kali harga, layanan, atau Panduan berubah.`,
    "",
    "## Aturan wajib",
    ...MANDATORY_RULES.map((r) => `- ${r}`),
    "",
    "## Studio dan jam kerja",
    `- ${studio.name}: layanan desain grafis, hanya melayani secara online.${contact ? ` Kontak: ${contact}.` : ""}`,
    `- Jam kerja tim desain: ${formatWorkingHours(ops)}. Di luar jam itu pesan tetap diterima dan dibalas pada jam kerja berikutnya.`,
    ops.revisionQuota > 0
      ? `- Revisi gratis ${ops.revisionQuota}x per project, diajukan lewat link portal project. Sampaikan apa adanya: "${ops.revisionNotice}"`
      : "- Tidak ada revisi gratis; permintaan revisi diteruskan ke admin.",
    `- Pengerjaan dimulai setelah DP dibayar sesuai invoice dari tim. ${ops.settlementNote}`,
    "",
    "## Katalog layanan",
    ...(services.length ? services.flatMap((s) => [...renderService(s, source), ""]) : ["Belum ada layanan aktif; teruskan semua pertanyaan layanan ke admin.", ""]),
  ];

  if (guide?.pricingRules.length) {
    out.push("## Aturan harga dari owner", "Hanya berlaku jika syaratnya terpenuhi; nilai akhirnya dikonfirmasi tim.");
    for (const r of guide.pricingRules) out.push(`- ${r.name}: ${describeRuleValue(r)}. Syarat: ${r.condition}${r.note ? ` ${r.note}` : ""}`);
    out.push("");
  }
  if (guide?.instructions.trim()) out.push("## Instruksi owner", guide.instructions.trim(), "");
  if (guide?.faqs.length) {
    out.push("## Pertanyaan umum (FAQ)");
    for (const f of guide.faqs) out.push(`**${f.question}**\n${f.answer}`, "");
  }
  if (guide?.knowledgeFiles.length) {
    out.push("## Pengetahuan tambahan");
    for (const f of guide.knowledgeFiles) out.push(`### ${f.title}`, ...(f.whenToUse ? [`Dipakai saat: ${f.whenToUse}`] : []), f.content, "");
  }
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

/** Muat data portal lalu bangun knowledge. Terbit = Panduan terbit + layanan aktif; draft = draft + semua layanan. */
export async function loadKirimiKnowledge(source: KnowledgeSource) {
  const [settings, rows, published, draft, ops] = await Promise.all([
    prisma.studioSettings.findUnique({ where: { id: "default" }, select: { name: true, email: true, phone: true, address: true } }),
    prisma.service.findMany({
      where: source === "published" ? { isActive: true } : {},
      select: { ...BOT_SERVICE_SELECT, isActive: true },
      orderBy: { code: "asc" },
    }),
    getPublishedGuide(),
    source === "draft" ? getDraftGuide() : Promise.resolve(null),
    getStudioOperations(),
  ]);
  const markdown = buildKirimiKnowledge({
    source,
    version: published?.version ?? null,
    generatedAt: new Date(),
    studio: {
      name: settings?.name ?? "YukDesain Studio",
      email: settings?.email ?? "",
      phone: settings?.phone ?? "",
      address: settings?.address ?? "",
    },
    ops,
    services: rows.map((r) => ({ ...toBotService(r), isActive: r.isActive })),
    guide: source === "draft" ? draft : (published?.guide ?? null),
  });
  return { source, version: published?.version ?? null, markdown, chars: markdown.length };
}
