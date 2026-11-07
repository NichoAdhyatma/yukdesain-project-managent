import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownView } from "./markdown-view";

const html = (md: string) => renderToStaticMarkup(createElement(MarkdownView, null, md));

describe("MarkdownView", () => {
  it("heading, daftar, tebal, dan tabel dirender", () => {
    const out = html("### Nada\n- Sapa *kak*\n- **Ramah**\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(out).toContain("<h5");
    expect(out).toContain("Nada</h5>");
    expect(out).toContain("<li>Sapa <em>kak</em></li>");
    expect(out).toContain("<strong>Ramah</strong>");
    expect(out).toContain("<table");
  });

  it("HTML mentah dan link javascript: tidak ikut", () => {
    const out = html('Halo <script>alert(1)</script><b onclick="x()">tebal</b>\n\n[klik](javascript:alert(1))');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("javascript:");
  });

  it("link dibuka di tab baru, gambar tidak dimuat", () => {
    const out = html("[portal](https://project.yukdesain.com) ![x](https://contoh.com/a.png)");
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).not.toContain("<img");
  });
});
