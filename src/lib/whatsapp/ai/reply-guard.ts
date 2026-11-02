// Pengaman terakhir di server untuk aturan "tidak menyebut harga/deadline sebelum
// admin mengisinya" (§10.4, DoD §20). Prompt bisa dilanggar; filter ini tidak.

const PRICE = /(harga|biaya|tarif|budget|bujet|estimasi|kisaran|ongkos|bayar)[^.!?\n]{0,40}(rp\.?\s?\d|\d[\d.,]*\s?(rb|ribu|k|jt|juta)\b|\d{1,3}(\.\d{3})+)/i;
const PRICE_REVERSED = /(rp\.?\s?\d[\d.,]*|\d[\d.,]*\s?(rb|ribu|jt|juta)\b)[^.!?\n]{0,30}(harga|biaya|tarif|untuk (desain|logo|jasa))/i;
const DURATION = /(selesai|jadi|estimasi|deadline|pengerjaan|dikerjakan|proses)[^.!?\n]{0,30}\d+\s?(-\s?\d+\s?)?(hari|minggu|jam|bulan)/i;

export const PRICE_PLACEHOLDER = "Untuk harga dan estimasi waktu, tim kami akan mengirimkannya setelah brief lengkap ya kak.";

export function mentionsPriceOrDeadline(sentence: string): boolean {
  return PRICE.test(sentence) || PRICE_REVERSED.test(sentence) || DURATION.test(sentence);
}

const digitsOf = (s: string) => (s.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]/g, ""));

/**
 * Buang kalimat yang menyebut harga/lama pengerjaan, lalu tambahkan kalimat
 * standar sekali. Dipakai hanya sebelum admin memberi harga.
 *
 * `briefText`: isi brief (mis. harga item menu dari klien). Kalimat yang semua
 * angkanya berasal dari brief tidak dianggap penawaran harga.
 */
export function stripPriceMentions(text: string, briefText = ""): { text: string; changed: boolean } {
  const briefNumbers = new Set(digitsOf(briefText));
  const fromBrief = (sentence: string) => {
    const numbers = digitsOf(sentence);
    return numbers.length > 0 && numbers.every((n) => briefNumbers.has(n));
  };
  // Pisah kalimat hanya di tanda baca yang diikuti spasi/baris baru, supaya
  // pemisah ribuan ("Rp500.000") tidak memecah kalimat.
  const parts = text.split(/(?<=[.!?])(?=\s)|(?<=\n)/);
  const kept = parts.filter((p) => !mentionsPriceOrDeadline(p) || fromBrief(p));
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

export type SanitizedReply = { text: string; rejected: boolean; changed: boolean };

/**
 * Bersihkan balasan model sebelum dikirim ke klien. `rejected` = balasan tidak layak
 * dikirim sama sekali (pemanggil memakai fallback).
 */
export function sanitizeReply(text: string): SanitizedReply {
  if (TOOL_MARKUP.test(text)) return { text: "", rejected: true, changed: true };

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
  if (out.length < 15) return { text: "", rejected: true, changed: true };
  return { text: out, rejected: false, changed: out !== text.trim() };
}
