// Format teks WhatsApp (*tebal*, _miring_, ~coret~, `kode`, ```blok kode```) → segmen untuk
// dirender sebagai React node. Tanpa HTML mentah, jadi isi chat klien tidak bisa menyisipkan markup.
// Aturan mengikuti WhatsApp: penanda harus di batas kata dan isinya tidak diawali/diakhiri spasi,
// supaya snake_case, 2*3*4, atau email tidak ikut terformat.

export type Segment =
  | string
  | { type: "bold" | "italic" | "strike"; children: Segment[] }
  | { type: "code" | "codeblock"; text: string };

const STYLE: Record<string, "bold" | "italic" | "strike"> = { "*": "bold", _: "italic", "~": "strike" };
const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
const isSpace = (c: string | undefined) => !!c && /\s/.test(c);

/** Indeks penutup untuk penanda di posisi `start`, atau -1. Penutup di baris yang sama. */
function findClose(text: string, start: number, marker: string): number {
  const first = text[start + 1];
  if (!first || isSpace(first) || first === marker) return -1;
  for (let j = start + 2; j < text.length; j++) {
    const c = text[j];
    if (c === "\n") return -1;
    if (c === marker && !isSpace(text[j - 1]) && !isWordChar(text[j + 1])) return j;
  }
  return -1;
}

export function parseWhatsAppFormatting(text: string): Segment[] {
  const out: Segment[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push(buffer);
    buffer = "";
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (text.startsWith("```", i)) {
      const end = text.indexOf("```", i + 3);
      if (end > i + 3) {
        flush();
        out.push({ type: "codeblock", text: text.slice(i + 3, end).replace(/^\n/, "") });
        i = end + 2;
        continue;
      }
    }

    if (c === "`") {
      const end = text.indexOf("`", i + 1);
      const newline = text.indexOf("\n", i + 1);
      if (end > i + 1 && (newline === -1 || end < newline)) {
        flush();
        out.push({ type: "code", text: text.slice(i + 1, end) });
        i = end;
        continue;
      }
    }

    if (STYLE[c] && !isWordChar(text[i - 1])) {
      const end = findClose(text, i, c);
      if (end !== -1) {
        flush();
        out.push({ type: STYLE[c], children: parseWhatsAppFormatting(text.slice(i + 1, end)) });
        i = end;
        continue;
      }
    }

    buffer += c;
  }
  flush();
  return out;
}
