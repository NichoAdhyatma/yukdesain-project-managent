import { createElement, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Penampil Markdown (docs/BOT_AI_PAGE.md §4). HTML mentah di dalam teks tidak dirender (skipHtml), dan
// URL berbahaya (javascript:) dibuang oleh defaultUrlTransform bawaan react-markdown.

type TagProps = { node?: unknown; className?: string; children?: ReactNode };

/** Elemen dengan kelas tetap. `node` (pohon hast dari react-markdown) tidak diteruskan ke DOM. */
const tag = (name: string, className: string, extra: Record<string, string> = {}) =>
  function MarkdownTag(props: TagProps) {
    const rest: Record<string, unknown> = { ...(props as Record<string, unknown>) };
    delete rest.node;
    return createElement(name, { ...rest, ...extra, className: cn(className, props.className) });
  };

const components: Components = {
  // Heading di dalam isi file diturunkan supaya tidak bersaing dengan judul halaman.
  h1: tag("h3", "mt-4 mb-2 text-base font-semibold first:mt-0"),
  h2: tag("h4", "mt-4 mb-2 text-sm font-semibold first:mt-0"),
  h3: tag("h5", "mt-3 mb-1.5 text-sm font-semibold first:mt-0"),
  h4: tag("h6", "mt-3 mb-1 text-sm font-medium first:mt-0"),
  p: tag("p", "my-2 first:mt-0 last:mb-0"),
  ul: tag("ul", "my-2 list-disc space-y-1 pl-5"),
  ol: tag("ol", "my-2 list-decimal space-y-1 pl-5"),
  blockquote: tag("blockquote", "my-2 border-l-2 pl-3 text-muted-foreground italic"),
  code: tag("code", "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"),
  pre: tag("pre", "my-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm [&_code]:bg-transparent [&_code]:p-0"),
  hr: tag("hr", "my-3"),
  a: tag("a", "text-primary underline underline-offset-2", { target: "_blank", rel: "noopener noreferrer" }),
  table: tag("table", "my-2 block w-full overflow-x-auto border-collapse text-sm"),
  th: tag("th", "border px-2 py-1 text-left font-medium"),
  td: tag("td", "border px-2 py-1 align-top"),
  // Gambar dari isi file tidak dimuat (tidak ada permintaan ke server luar).
  img: () => null,
};

export function MarkdownView({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("text-sm leading-relaxed break-words", className)}>
      <Markdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {children}
      </Markdown>
    </div>
  );
}
