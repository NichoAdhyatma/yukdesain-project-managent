import { Fragment } from "react";
import { parseWhatsAppFormatting, type Segment } from "./whatsapp-format";

// Isi pesan WhatsApp dengan formatnya (tebal, miring, coret, kode). Baris baru dipertahankan
// oleh `whitespace-pre-wrap` di pembungkus.

function render(segments: Segment[]): React.ReactNode[] {
  return segments.map((s, i) => {
    if (typeof s === "string") return <Fragment key={i}>{s}</Fragment>;
    switch (s.type) {
      case "bold":
        return <strong key={i} className="font-semibold">{render(s.children)}</strong>;
      case "italic":
        return <em key={i}>{render(s.children)}</em>;
      case "strike":
        return <s key={i}>{render(s.children)}</s>;
      case "code":
        return (
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
            {s.text}
          </code>
        );
      case "codeblock":
        return (
          <code key={i} className="my-1 block rounded bg-muted px-2 py-1.5 font-mono text-[0.85em]">
            {s.text}
          </code>
        );
    }
  });
}

export function WhatsAppText({ text, className }: { text: string; className?: string }) {
  return <div className={className ?? "whitespace-pre-wrap break-words"}>{render(parseWhatsAppFormatting(text))}</div>;
}
