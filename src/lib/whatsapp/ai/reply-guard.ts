// Pengaman terakhir di server untuk aturan "tidak menyebut harga/deadline sebelum
// admin mengisinya" (§10.4, DoD §20). Prompt bisa dilanggar; filter ini tidak.

const PRICE = /(harga|biaya|tarif|budget|bujet|estimasi|kisaran|ongkos|bayar)[^.!?\n]{0,40}(rp\.?\s?\d|\d[\d.,]*\s?(rb|ribu|k|jt|juta)\b|\d{1,3}(\.\d{3})+)/i;
const PRICE_REVERSED = /(rp\.?\s?\d[\d.,]*|\d[\d.,]*\s?(rb|ribu|jt|juta)\b)[^.!?\n]{0,30}(harga|biaya|tarif|untuk (desain|logo|jasa))/i;
// Potongan/biaya tambahan (termasuk persen): hanya boleh jika nilainya dari aturan harga owner.
const DISCOUNT = /(diskon|potongan|promo|cashback|tambahan|surcharge)[^.!?\n]{0,40}(rp\.?\s?\d|\d[\d.,]*\s?(rb|ribu|k|jt|juta)\b|\d{1,3}(\.\d{3})+|\d{1,3}\s?%)/i;
// Nominal rupiah tanpa kata kunci ("mulai Rp150.000", "jadi 300rb", "120k", "IDR 120.000", "120.000"): sejak
// bot boleh menyebut harga mulai (docs/SERVICES_CATALOG.md), setiap nominal harus berasal dari data yang diizinkan.
const RUPIAH = /(rp\.?\s?\d|idr\s?\d|\d[\d.,]*\s?(rb|ribu|k|jt|juta)\b|\b\d{1,3}(\.\d{3})+\b)/i;
const DURATION = /(selesai|jadi|estimasi|deadline|pengerjaan|dikerjakan|proses)[^.!?\n]{0,30}\d+\s?(-\s?\d+\s?)?(hari|minggu|jam|bulan)/i;
// Kalimat yang lolos karena angka katalog harus berupa harga mulai, bukan total / harga final.
const STARTING = /\bmulai\b/i;
const TOTAL = /\b(total|totalnya|jadi|semua|seluruh|sekalian|dikali)\b|\d\s?x\b|\bx\s?\d/i;

export const PRICE_PLACEHOLDER = "Untuk harga dan estimasi waktu, tim kami akan mengirimkannya setelah brief lengkap ya kak.";

export function mentionsPriceOrDeadline(sentence: string): boolean {
  return PRICE.test(sentence) || PRICE_REVERSED.test(sentence) || RUPIAH.test(sentence) || DISCOUNT.test(sentence) || DURATION.test(sentence);
}

const SUFFIX: Record<string, number> = { rb: 1e3, ribu: 1e3, k: 1e3, jt: 1e6, juta: 1e6 };

/**
 * Semua angka di teks sebagai nilai rupiah utuh, supaya format berbeda dianggap sama:
 * "18rb" = "Rp18.000" = "18000"; "Rp150.000,-" / "150.000,00" = "150000"; "1,5 jt" = "1500000".
 */
export function amountsOf(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(\d[\d.,]*)(?:\s?(rb|ribu|k|jt|juta)\b)?/gi)) {
    let raw = m[1].replace(/[.,]+$/, "").replace(/[.,]00$/, "");
    const mult = m[2] ? SUFFIX[m[2].toLowerCase()] : 1;
    if (mult > 1 && /^\d+[.,]\d{1,2}$/.test(raw)) {
      out.push(String(Math.round(parseFloat(raw.replace(",", ".")) * mult)));
      continue;
    }
    raw = raw.replace(/[.,]/g, "");
    if (raw) out.push(String(Number(raw) * mult));
  }
  return out;
}

export type GuardExtras = {
  /** Angka dari teks kebijakan/FAQ owner: berlaku untuk kalimat selain lama pengerjaan. */
  policyNumbers?: string[];
  /** Angka katalog per layanan (harga mulai + catatan harga): hanya untuk kalimat "mulai …" satu layanan. */
  catalogGroups?: string[][];
  /** Nominal layanan berharga pasti, per layanan (harga, paket, tambahan per unit, nominal di catatan): tanpa "mulai", tanpa kata total. */
  fixedGroups?: string[][];
  /** Total + nominal rincian calculate_price pada giliran ini: lolos termasuk kalimat "total"/"jadi". */
  calculatedTotals?: string[];
  /** Angka estimasi per layanan ("5-7 hari" → ["5","7"]): satu-satunya lama pengerjaan yang boleh disebut. */
  estimateGroups?: string[][];
};

// Nominal uang: "Rp…", "IDR …", "…rb/ribu/k/jt/juta", "150.000". Angka biasa ("8 desain", "35 item") bukan harga.
const MONEY = /(?:rp\.?\s?|idr\s?)\d[\d.,]*|\d[\d.,]*\s?(?:rb|ribu|k|jt|juta)\b|\b\d{1,3}(?:\.\d{3})+\b/gi;
const PERCENT = /(\d+(?:[.,]\d+)?)\s?%/g;
// Potongan harga: hanya dari aturan harga owner / brief / teks kebijakan, tidak pernah dari katalog atau kalkulator.
const DISCOUNT_WORD = /\b(diskon|potongan|promo|cashback|surcharge)\b/i;
// Percepatan selalu lewat owner (spec §2): kalimat lama pengerjaan dengan kata ini hanya lolos dari aturan owner.
const EXPRESS = /\b(express|ekspres|kilat|dipercepat|percepat|lebih cepat)\b/i;
// Angka yang diikuti satuan waktu: "3 hari", "5-7 hari", "1 sampai 2 hari".
const DURATION_NUMBERS = /(\d+)\s?(?:(?:-|–|sampai|hingga|s\/d|atau)\s?(\d+)\s?)?(?:hari|minggu|jam|bulan)/gi;

export function moneyAmounts(text: string): string[] {
  return [...text.matchAll(MONEY)].flatMap((m) => amountsOf(m[0]));
}

function percentAmounts(text: string): string[] {
  return [...text.matchAll(PERCENT)].map((m) => String(Number(m[1].replace(",", "."))));
}

function durationNumbers(sentence: string): string[] {
  return [...sentence.matchAll(DURATION_NUMBERS)].flatMap((m) => [m[1], ...(m[2] ? [m[2]] : [])].map((n) => String(Number(n))));
}

/**
 * Buang kalimat yang menyebut harga/lama pengerjaan, lalu tambahkan kalimat
 * standar sekali. Dipakai hanya sebelum admin memberi harga.
 *
 * Yang diperiksa: nominal uang, persen, dan angka lama pengerjaan (angka biasa seperti "8 desain" bukan harga).
 * Angka yang diizinkan, dibandingkan sebagai nilai rupiah (amountsOf):
 * - `briefText` (isi brief klien) dan `allowedNumbers` (aturan harga owner): kalimat apa pun.
 * - `policyNumbers` (teks kebijakan / FAQ owner): bukan kalimat lama pengerjaan.
 * - Kalimat diskon/potongan dan persen: hanya dua sumber di atas.
 * - `calculatedTotals` (hasil calculate_price giliran ini): boleh dengan kata total.
 * - `fixedGroups` (layanan berharga pasti): tanpa syarat "mulai", tanpa kata total, semua nominal dari satu layanan.
 * - `catalogGroups` (menu Layanan): wajib kata "mulai", tanpa kata total, semua nominal dari satu layanan.
 * - Lama pengerjaan: semua angka durasi dari estimasi satu layanan (`estimateGroups`), tanpa kata percepatan.
 */
export function stripPriceMentions(
  text: string,
  briefText = "",
  // Nilai aturan harga owner yang sudah terbit (docs/WHATSAPP_OWNER_COMMANDS.md §6)
  allowedNumbers: string[] = [],
  extras: GuardExtras = {},
): { text: string; changed: boolean } {
  const always = new Set([...amountsOf(briefText), ...allowedNumbers.flatMap(amountsOf)]);
  const policy = new Set((extras.policyNumbers ?? []).flatMap(amountsOf));
  const toSets = (groups: string[][] | undefined) => (groups ?? []).map((g) => new Set(g.flatMap(amountsOf)));
  const groups = toSets(extras.catalogGroups);
  const fixedGroups = toSets(extras.fixedGroups);
  const estimateGroups = toSets(extras.estimateGroups);
  const calculated = new Set((extras.calculatedTotals ?? []).flatMap(amountsOf));
  const oneGroup = (sets: Set<string>[], numbers: string[]) => sets.some((g) => numbers.every((n) => g.has(n)));

  const pricesAllowed = (sentence: string, money: string[]) => {
    if (money.length === 0) return true;
    if (money.some((n) => calculated.has(n)) && money.every((n) => calculated.has(n) || fixedGroups.some((g) => g.has(n)))) return true;
    if (TOTAL.test(sentence)) return false;
    if (oneGroup(fixedGroups, money)) return true;
    return STARTING.test(sentence) && oneGroup(groups, money);
  };
  const allowedSentence = (sentence: string) => {
    if (amountsOf(sentence).length === 0) return false;
    const notAlways = (n: string) => !always.has(n);
    const money = moneyAmounts(sentence).filter(notAlways);
    const percents = percentAmounts(sentence).filter(notAlways);
    const isDuration = DURATION.test(sentence);
    if (isDuration) {
      const durations = durationNumbers(sentence).filter(notAlways);
      if (durations.length > 0 && (EXPRESS.test(sentence) || !oneGroup(estimateGroups, durations))) return false;
    }
    // Kalimat lama pengerjaan tidak memakai teks kebijakan (mis. "revisi 4" bukan "4 hari").
    const fromPolicy = (n: string) => !isDuration && policy.has(n);
    if (percents.some((n) => !fromPolicy(n))) return false;
    if (DISCOUNT_WORD.test(sentence)) return money.every(fromPolicy);
    return pricesAllowed(sentence, money.filter((n) => !fromPolicy(n)));
  };
  // Pisah kalimat hanya di tanda baca yang diikuti spasi/baris baru, supaya
  // pemisah ribuan ("Rp500.000") tidak memecah kalimat.
  const parts = text.split(/(?<=[.!?])(?=\s)|(?<=\n)/);
  const kept = parts.filter((p) => !mentionsPriceOrDeadline(p) || allowedSentence(p));
  if (kept.length === parts.length) return { text, changed: false };
  const body = kept.join("").trim();
  return { text: body ? `${body}\n\n${PRICE_PLACEHOLDER}` : PRICE_PLACEHOLDER, changed: true };
}

export const DP_PLACEHOLDER = "Nominal DP dan cara pembayarannya ada di invoice yang sudah kami kirim ya kak.";
const DP_WORD = /\b(dp|uang\s?muka|panjar|tanda\s?jadi|down\s?payment)(-?nya)?\b/i;
// Persen yang ditulis dengan kata ("50 persen").
const PERCENT_WORD = /\d+\s?persen\b/i;
// Angka biasa ("DP 750000") di kalimat yang berkata DP juga dianggap nominal.
const BARE_NUMBER = /\d{2,}/;

/**
 * Setelah invoice terkirim (QUOTED / DP_REVIEW), bot merujuk invoice dan tidak menyebut nominal atau persen DP
 * (spec 2026-11-11-kb-merge-design §5). Dibuang: kalimat berkata DP/uang muka/panjar/tanda jadi yang memuat angka,
 * dan kalimat apa pun yang memuat nominal DP / sisa pelunasan order ini (`dpNumbers`).
 */
export function stripDpMentions(text: string, dpNumbers: string[] = []): { text: string; changed: boolean } {
  const dp = new Set(dpNumbers.flatMap(amountsOf));
  const mentionsDp = (p: string) =>
    (DP_WORD.test(p) && (moneyAmounts(p).length > 0 || percentAmounts(p).length > 0 || PERCENT_WORD.test(p) || BARE_NUMBER.test(p))) ||
    amountsOf(p).some((n) => dp.has(n));
  const parts = text.split(/(?<=[.!?])(?=\s)|(?<=\n)/);
  const kept = parts.filter((p) => !mentionsDp(p));
  if (kept.length === parts.length) return { text, changed: false };
  const body = kept.join("").trim();
  return { text: body ? `${body}\n\n${DP_PLACEHOLDER}` : DP_PLACEHOLDER, changed: true };
}

// Nomor daftar di awal baris ("1. Nama") bukan akhir kalimat.
const SENTENCE_SPLIT = /(?<=[.!?])(?<!^[ \t]*\d+\.)(?=\s)|(?<=\n)/m;
const LIST_MARKER = /^\s*(?:[-•*]|\d+[.)])\s+/;
// Ringkasan brief yang diperbarui memang dikirim ulang utuh.
const SUMMARY_MIN_LIST_LINES = 3;
// Kalimat pendek ("Siap kak, ditunggu ya.") wajar terulang; yang dijaga kalimat berisi.
const MIN_REPEAT_WORDS = 5;
const SIMILAR_JACCARD = 0.6;
const SIMILAR_CONTAINED = 0.8;

const wordsOf = (sentence: string) =>
  sentence.toLowerCase().replace(/[*_~]/g, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Angka, teks *tebal*, dan teks "berkutip": kalimat yang membawa nilai baru bukan ulangan. */
function keyWordsOf(sentence: string): string[] {
  const marked = [...sentence.matchAll(/\*([^*\n]+)\*|"([^"\n]+)"/g)].flatMap((m) => wordsOf(m[1] ?? m[2]));
  return [...wordsOf(sentence).filter((w) => /\d/.test(w)), ...marked];
}

function isRepeatOf(sentence: string, previous: string): boolean {
  const words = new Set(wordsOf(sentence));
  const prev = new Set(wordsOf(previous));
  if (words.size < MIN_REPEAT_WORDS || prev.size === 0) return false;
  if (keyWordsOf(sentence).some((w) => !prev.has(w))) return false;
  const shared = [...words].filter((w) => prev.has(w)).length;
  const union = words.size + prev.size - shared;
  return shared / union >= SIMILAR_JACCARD || shared / words.size >= SIMILAR_CONTAINED;
}

const sentencesOf = (text: string) =>
  text
    .split(SENTENCE_SPLIT)
    .map((p) => p.replace(LIST_MARKER, "").trim())
    .filter(Boolean);

// Pertanyaan pendek yang sama persis ("Rencananya berapa halaman?") juga terhitung ulangan.
const MIN_REPEAT_QUESTION_WORDS = 4;
const sameWords = (a: string, b: string) => {
  const wa = wordsOf(a);
  return wa.length >= MIN_REPEAT_QUESTION_WORDS && wa.join(" ") === wordsOf(b).join(" ");
};

/**
 * Buang kalimat yang sudah dikirim (sama atau mirip) di pesan keluar terakhir (`recent`, terbaru dulu), supaya bot
 * tidak mengulang kalimat yang sama (produksi 2026-11-12). Pertanyaan hanya dibuang bila persis sama dengan pertanyaan
 * di pesan terakhir: menanyakan lagi hal yang belum dijawab (dengan kalimat lain, atau setelah pesan lain) tetap boleh.
 * Kalimat pembuka ("…infokan:") ikut dibuang bila daftar di bawahnya habis. Ringkasan bernomor dikirim utuh.
 * Hasil kosong = seluruh balasan ulangan.
 */
export function dropRepeatedSentences(text: string, recent: string[]): string {
  if (recent.length === 0) return text;
  if (text.split("\n").filter((l) => LIST_MARKER.test(l)).length >= SUMMARY_MIN_LIST_LINES) return text;
  const lastSentences = sentencesOf(recent[0]);
  const allSentences = recent.flatMap(sentencesOf);
  const kept = text.split(SENTENCE_SPLIT).filter((part) => {
    const sentence = part.replace(LIST_MARKER, "").trim();
    if (!sentence || sentence.endsWith(":")) return true;
    if (sentence.endsWith("?")) return !lastSentences.some((prev) => sameWords(sentence, prev));
    return !allSentences.some((prev) => isRepeatOf(sentence, prev));
  });
  // Pembuka yang tidak lagi diikuti butir daftar.
  const result = kept.filter((part, i) => {
    if (!part.trim().endsWith(":")) return true;
    const next = kept.slice(i + 1).find((p) => p.trim());
    return next !== undefined && LIST_MARKER.test(next);
  });
  return result.join("").replace(/\n{3,}/g, "\n\n").trim();
}

// Batas teks WhatsApp 4096 karakter.
export const WA_TEXT_LIMIT = 4000;

export function clampReply(text: string): string {
  const t = text.trim();
  return t.length > WA_TEXT_LIMIT ? `${t.slice(0, WA_TEXT_LIMIT - 1)}…` : t;
}

// Sisa sintaks tool-call yang ditulis model sebagai teks (mis. model/gateway non-standar).
const TOOL_MARKUP = /<\/?(tool_call|tool_use|invoke|function_calls|parameter)\b|\]<\]|\[>\[/i;
// Unit 1–4 karakter yang berulang ≥ 20 kali: output model yang rusak. Ambang cukup
// tinggi supaya garis pemisah atau titik-titik biasa tidak ikut terpotong.
const DEGENERATE_RUN = /([\s\S]{1,4}?)\1{19,}/;
// Huruf Han/Kana/Hangul: tidak pernah dipakai dalam balasan berbahasa Indonesia.
const CJK = /[぀-ヿ㐀-鿿가-힯]+/g;
// Label riwayat untuk pesan tim (conversation.ts TEAM_MESSAGE_LABEL) yang ditiru model.
const TEAM_LABEL = /\[Pesan dari tim studio\]\s*/gi;
// Kode layanan internal (SVC-01) tidak untuk klien; nama layanan sudah cukup.
const SERVICE_CODE = /\s*\(?\bSVC-\d{2}\b\)?/g;

export type RejectReason = "tool_markup" | "too_short";
export type SanitizedReply = { text: string; rejected: boolean; changed: boolean; reason?: RejectReason };

/**
 * Bersihkan balasan model sebelum dikirim ke klien. `rejected` = balasan tidak layak
 * dikirim sama sekali (pemanggil memakai fallback).
 */
export function sanitizeReply(text: string): SanitizedReply {
  if (TOOL_MARKUP.test(text)) return { text: "", rejected: true, changed: true, reason: "tool_markup" };

  let out = text;
  const run = out.match(DEGENERATE_RUN);
  if (run?.index !== undefined) out = out.slice(0, run.index);
  out = out
    .replace(CJK, "")
    .replace(TEAM_LABEL, "")
    .replace(SERVICE_CODE, "")
    .replace(/[ \t]+—[ \t]+/g, ", ")
    .replace(/,(\s*,)+/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  // Sisa terlalu pendek untuk jadi balasan yang bermakna.
  if (out.length < 15) return { text: "", rejected: true, changed: true, reason: "too_short" };
  return { text: out, rejected: false, changed: out !== text.trim() };
}
