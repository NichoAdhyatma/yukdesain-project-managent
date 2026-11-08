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
};

/**
 * Buang kalimat yang menyebut harga/lama pengerjaan, lalu tambahkan kalimat
 * standar sekali. Dipakai hanya sebelum admin memberi harga.
 *
 * Angka yang diizinkan, dibandingkan sebagai nilai rupiah (amountsOf):
 * - `briefText` (isi brief klien) dan `allowedNumbers` (aturan harga owner): kalimat apa pun.
 * - `policyNumbers` (teks kebijakan / FAQ owner): bukan kalimat lama pengerjaan.
 * - `catalogGroups` (menu Layanan): bukan lama pengerjaan, wajib kata "mulai", tanpa kata total, dan semua
 *   angka sisanya dari satu layanan, supaya bot tidak menghitung total atau mencampur harga layanan lain.
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
  const groups = (extras.catalogGroups ?? []).map((g) => new Set(g.flatMap(amountsOf)));
  const allowedSentence = (sentence: string) => {
    const numbers = amountsOf(sentence);
    if (numbers.length === 0) return false;
    const rest = numbers.filter((n) => !always.has(n));
    if (rest.length === 0) return true;
    if (DURATION.test(sentence)) return false;
    const afterPolicy = rest.filter((n) => !policy.has(n));
    if (afterPolicy.length === 0) return true;
    if (!STARTING.test(sentence) || TOTAL.test(sentence)) return false;
    return groups.some((g) => afterPolicy.every((n) => g.has(n)));
  };
  // Pisah kalimat hanya di tanda baca yang diikuti spasi/baris baru, supaya
  // pemisah ribuan ("Rp500.000") tidak memecah kalimat.
  const parts = text.split(/(?<=[.!?])(?=\s)|(?<=\n)/);
  const kept = parts.filter((p) => !mentionsPriceOrDeadline(p) || allowedSentence(p));
  if (kept.length === parts.length) return { text, changed: false };
  const body = kept.join("").trim();
  return { text: body ? `${body}\n\n${PRICE_PLACEHOLDER}` : PRICE_PLACEHOLDER, changed: true };
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
    .replace(SERVICE_CODE, "")
    .replace(/[ \t]+—[ \t]+/g, ", ")
    .replace(/,(\s*,)+/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  // Sisa terlalu pendek untuk jadi balasan yang bermakna.
  if (out.length < 15) return { text: "", rejected: true, changed: true, reason: "too_short" };
  return { text: out, rejected: false, changed: out !== text.trim() };
}
