"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  Copy,
  Layers,
  Loader2,
  Lock,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Tag,
  Workflow,
  Wrench,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BRAIN_QUERY_KEY } from "./BotGuideCard";

// Otak bot (docs/WHATSAPP_BOT_BRAIN_VIEW.md): semua yang diketahui bot, hanya dibaca. Tombol Ubah membuka
// editor aslinya (Panduan bot, menu Services, Settings › General).

type Source = "published" | "draft";

type Brain = {
  source: Source;
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

async function fetchBrain(source: Source): Promise<Brain> {
  const res = await fetch(`/api/settings/whatsapp/brain?source=${source}`);
  if (!res.ok) throw new Error("Otak bot tidak bisa dimuat");
  return res.json();
}

const fmt = (n: number) => n.toLocaleString("id-ID");

/** Gulir ke bagian Panduan bot lalu fokus ke kontrol pertamanya. */
function goToGuide(sectionId: string) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  el.querySelector<HTMLElement>("textarea, input, button")?.focus({ preventScroll: true });
}

function EditGuideButton({ section, label }: { section: string; label: string }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="max-md:h-11" onClick={() => goToGuide(section)}>
      Ubah
      <span className="sr-only"> {label} di Panduan bot</span>
    </Button>
  );
}

function EditLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={buttonVariants({ variant: "ghost", size: "sm", className: "max-md:h-11" })}>
      Ubah
      <span className="sr-only"> {label}</span>
    </Link>
  );
}

type BranchProps = {
  id: string;
  icon: ReactNode;
  title: string;
  meta: string;
  open: boolean;
  onToggle: () => void;
  locked?: boolean;
  badge?: string | null;
  action?: ReactNode;
  children: ReactNode;
};

function Branch({ id, icon, title, meta, open, onToggle, locked, badge, action, children }: BranchProps) {
  const panelId = `brain-${id}`;
  return (
    <li className="border-b last:border-b-0">
      <div className="flex items-center gap-1 py-1">
        <button
          type="button"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="shrink-0 text-muted-foreground">{icon}</span>
          <span className="font-medium">{title}</span>
          {locked && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only sm:text-xs">dikunci</span>
            </span>
          )}
          <span className="ml-auto shrink-0 pl-2 text-muted-foreground tabular-nums">{meta}</span>
        </button>
        {action}
      </div>
      {badge && <p className="-mt-1 pb-2 pl-10 text-sm text-amber-700 dark:text-amber-300">{badge}</p>}
      {open && (
        <div id={panelId} className="pb-3 pl-6 sm:pl-10">
          {children}
        </div>
      )}
    </li>
  );
}

/** Daun yang isinya panjang: dibuka dengan <details> supaya tetap ringkas. */
function Leaf({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  if (!children) {
    return (
      <li className="py-1.5 text-sm">
        <p className="break-words">{title}</p>
        {subtitle && <p className="break-words text-muted-foreground">{subtitle}</p>}
      </li>
    );
  }
  return (
    <li className="text-sm">
      <details className="group rounded-md">
        <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2 rounded-md px-2 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block break-words">{title}</span>
            {subtitle && <span className="block break-words text-muted-foreground">{subtitle}</span>}
          </span>
        </summary>
        <div className="mb-2 ml-8 whitespace-pre-wrap break-words rounded-md bg-muted/60 p-3 text-sm">{children}</div>
      </details>
    </li>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="py-1.5 text-sm text-muted-foreground">{children}</p>;

const BRANCHES = ["studio", "services", "pricing", "flow", "rules", "guide", "capabilities"] as const;
type BranchId = (typeof BRANCHES)[number];

export function BotBrainCard() {
  const [source, setSource] = useState<Source>("published");
  const [open, setOpen] = useState<Set<BranchId>>(new Set());
  const [showPrompt, setShowPrompt] = useState(false);
  const { data, isLoading, isError, refetch, isRefetching } = useQuery<Brain>({
    queryKey: [...BRAIN_QUERY_KEY, source],
    queryFn: () => fetchBrain(source),
  });

  const toggle = (id: BranchId) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOpen = open.size === BRANCHES.length;

  const header = (
    <CardHeader>
      <CardTitle>Otak bot</CardTitle>
      <CardDescription>
        Semua yang diketahui bot saat membalas klien, dalam satu tampilan. Untuk mengubah, pakai tombol Ubah di tiap
        bagian. Ingatan per percakapan (order dan brief yang sedang berjalan) tidak ditampilkan karena berbeda untuk
        setiap klien.
      </CardDescription>
    </CardHeader>
  );

  const sourceToggle = (
    <div role="group" aria-label="Versi yang ditampilkan" className="inline-flex rounded-lg border p-0.5">
      {(
        [
          ["published", "Versi terbit"],
          ["draft", "Draft"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={source === value}
          onClick={() => setSource(value)}
          className={cn(
            "min-h-9 rounded-md px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:min-h-11",
            source === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <Card aria-busy="true">
        {header}
        <CardContent className="space-y-3">
          {sourceToggle}
          {BRANCHES.map((b) => (
            <div key={b} className="h-9 w-full animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        {header}
        <CardContent className="space-y-3">
          <p className="text-sm text-destructive">Otak bot tidak bisa dimuat.</p>
          <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
            {isRefetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Coba lagi
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { guide, studio } = data;
  const isDraft = data.source === "draft";
  // Penanda per bagian Panduan: dilihat dari versi terbit → ada perubahan di draft; dari draft → belum terbit.
  const changedNote = (changed: boolean) => (changed ? (isDraft ? "Belum terbit" : "Ada perubahan di draft") : null);
  const guideChanged = Object.values(guide.changed).some(Boolean);
  const guideCount =
    (guide.instructions ? 1 : 0) + guide.knowledgeFiles.length + guide.faqs.length + data.pricingRules.length;
  const studioFields = [
    ["Nama", studio.name],
    ["Email", studio.email],
    ["Telepon", studio.phone],
    ["Alamat", studio.address],
  ] as const;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(data.prompt.text);
      toast("Isi prompt disalin", "success");
    } catch {
      toast("Tidak bisa menyalin. Pilih teks lalu salin manual.", "error");
    }
  };

  return (
    <Card>
      {header}
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {sourceToggle}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {data.published ? (
              <Badge variant="secondary">Versi {data.published.version} aktif</Badge>
            ) : (
              <Badge variant="outline">Belum ada versi terbit</Badge>
            )}
            {data.draftDiffers && <Badge variant="outline">Draft berbeda</Badge>}
            <span className="text-muted-foreground tabular-nums">±{fmt(data.prompt.approxTokens)} token</span>
          </div>
        </div>

        {!isDraft && !data.published && (
          <p className="text-sm text-muted-foreground">
            Belum ada panduan terbit, jadi klien hanya mendapat aturan dasar, layanan, dan identitas studio. Pilih Draft
            untuk melihat yang sedang disiapkan.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="max-md:h-11" onClick={() => setShowPrompt(true)}>
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            Lihat isi lengkap
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="max-md:h-11"
            onClick={() => setOpen(allOpen ? new Set() : new Set(BRANCHES))}
          >
            {allOpen ? "Tutup semua" : "Buka semua"}
          </Button>
        </div>

        <ul className="rounded-lg border px-2" aria-label="Isi otak bot">
          <Branch
            id="studio"
            icon={<Building2 className="h-4 w-4" />}
            title="Identitas studio"
            meta={`${studioFields.filter(([, v]) => v).length} info`}
            open={open.has("studio")}
            onToggle={() => toggle("studio")}
            action={<EditLink href="/settings?tab=general" label="identitas studio di Settings General" />}
          >
            <ul>
              {studioFields.map(([label, value]) => (
                <Leaf key={label} title={label} subtitle={value || "Belum diisi"} />
              ))}
            </ul>
          </Branch>

          <Branch
            id="services"
            icon={<Layers className="h-4 w-4" />}
            title="Layanan"
            meta={`${data.services.length} aktif`}
            open={open.has("services")}
            onToggle={() => toggle("services")}
            action={<EditLink href="/services" label="layanan di menu Services" />}
          >
            {data.services.length === 0 ? (
              <Empty>Belum ada layanan aktif, jadi bot tidak bisa memulai order.</Empty>
            ) : (
              <ul>
                {data.services.map((s) =>
                  s.description ? (
                    <Leaf key={s.name} title={s.name} subtitle={s.outputFormat || undefined}>
                      {s.description}
                    </Leaf>
                  ) : (
                    <Leaf key={s.name} title={s.name} subtitle={s.outputFormat || undefined} />
                  ),
                )}
              </ul>
            )}
          </Branch>

          <Branch
            id="pricing"
            icon={<Tag className="h-4 w-4" />}
            title="Harga"
            meta={`${data.pricingRules.length} aturan`}
            open={open.has("pricing")}
            onToggle={() => toggle("pricing")}
            badge={changedNote(guide.changed.pricingRules)}
            action={<EditGuideButton section="wa-guide-section-pricing" label="aturan harga" />}
          >
            <p className="py-1.5 text-sm">
              Bot tidak memegang daftar harga. Harga, DP, dan deadline diisi admin per order di Order WA; bot hanya
              menyampaikannya. Yang boleh disebut bot sebelum penawaran hanya aturan harga berikut.
            </p>
            {data.pricingRules.length === 0 ? (
              <Empty>Belum ada aturan harga.</Empty>
            ) : (
              <ul>
                {data.pricingRules.map((r) => (
                  <Leaf key={r.name} title={`${r.name}: ${r.value}`} subtitle={`Syarat: ${r.condition}`}>
                    {r.note ? `Cara menyampaikan: ${r.note}` : null}
                  </Leaf>
                ))}
              </ul>
            )}
          </Branch>

          <Branch
            id="flow"
            icon={<Workflow className="h-4 w-4" />}
            title="Alur order"
            meta={`${data.flow.length} tahap`}
            open={open.has("flow")}
            onToggle={() => toggle("flow")}
            locked
          >
            <ol>
              {data.flow.map((step, i) => (
                <li key={step.status} className="flex gap-3 py-1.5 text-sm">
                  <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">{i + 1}.</span>
                  <span className="min-w-0">
                    <span className="font-medium">{step.label}</span>
                    <span className="text-muted-foreground"> · {step.actor}</span>
                    <span className="block break-words text-muted-foreground">{step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Branch>

          <Branch
            id="rules"
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Aturan dasar"
            meta={`${data.baseRules.length} bagian`}
            open={open.has("rules")}
            onToggle={() => toggle("rules")}
            locked
          >
            <p className="py-1.5 text-sm text-muted-foreground">
              Ditulis di sistem dan tidak bisa diubah dari portal. Panduan owner berlaku selama tidak bertentangan
              dengan aturan ini.
            </p>
            <ul>
              {data.baseRules.map((r) => (
                <Leaf key={r.title} title={r.title}>
                  {r.text}
                </Leaf>
              ))}
            </ul>
          </Branch>

          <Branch
            id="guide"
            icon={<BookOpen className="h-4 w-4" />}
            title="Panduan owner"
            meta={`${guideCount} isi`}
            open={open.has("guide")}
            onToggle={() => toggle("guide")}
            badge={changedNote(guideChanged)}
            action={<EditGuideButton section="wa-guide-section-instructions" label="panduan" />}
          >
            <GuideGroup
              title="Aturan tambahan"
              meta={guide.instructions ? `${fmt(guide.instructions.length)} karakter` : "kosong"}
              note={changedNote(guide.changed.instructions)}
              section="wa-guide-section-instructions"
            >
              {guide.instructions ? (
                <ul>
                  <Leaf title="Lihat isi">{guide.instructions}</Leaf>
                </ul>
              ) : null}
            </GuideGroup>
            <GuideGroup
              title="File pengetahuan"
              meta={`${guide.knowledgeFiles.length} file`}
              note={changedNote(guide.changed.knowledgeFiles)}
              section="wa-guide-section-knowledge"
            >
              {guide.knowledgeFiles.length ? (
                <ul>
                  {guide.knowledgeFiles.map((f) => (
                    <Leaf
                      key={f.title}
                      title={f.title}
                      subtitle={`${f.whenToUse ? `Dipakai saat: ${f.whenToUse} · ` : ""}${fmt(f.content.length)} karakter`}
                    >
                      {f.content}
                    </Leaf>
                  ))}
                </ul>
              ) : null}
            </GuideGroup>
            <GuideGroup
              title="FAQ"
              meta={`${guide.faqs.length} pertanyaan`}
              note={changedNote(guide.changed.faqs)}
              section="wa-guide-section-faq"
            >
              {guide.faqs.length ? (
                <ul>
                  {guide.faqs.map((f, i) => (
                    <Leaf key={`${i}-${f.question}`} title={f.question}>
                      {f.answer}
                    </Leaf>
                  ))}
                </ul>
              ) : null}
            </GuideGroup>
            <p className="py-1.5 text-sm text-muted-foreground">
              Aturan harga ({data.pricingRules.length}) ada di cabang Harga.
            </p>
          </Branch>

          <Branch
            id="capabilities"
            icon={<Wrench className="h-4 w-4" />}
            title="Kemampuan"
            meta={`${data.capabilities.length} hal`}
            open={open.has("capabilities")}
            onToggle={() => toggle("capabilities")}
            locked
          >
            <ul>
              {data.capabilities.map((c) => (
                <Leaf key={c.name} title={c.label} subtitle={c.detail} />
              ))}
            </ul>
          </Branch>
        </ul>
      </CardContent>

      <Dialog open={showPrompt} onOpenChange={setShowPrompt}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Isi lengkap otak bot ({isDraft ? "draft" : "versi terbit"})</DialogTitle>
            <DialogDescription>
              Teks persis yang diterima model di setiap pesan: {fmt(data.prompt.chars)} karakter, ditambah definisi
              kemampuan {fmt(data.prompt.toolChars)} karakter (±{fmt(data.prompt.approxTokens)} token). Ingatan per
              percakapan ditambahkan sistem untuk setiap klien dan tidak tampil di sini.
            </DialogDescription>
          </DialogHeader>
          <pre
            tabIndex={0}
            aria-label="Isi prompt"
            className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 font-mono text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {data.prompt.text}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrompt(false)}>
              Tutup
            </Button>
            <Button onClick={copyPrompt}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Salin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function GuideGroup({
  title,
  meta,
  note,
  section,
  children,
}: {
  title: string;
  meta: string;
  note: string | null;
  section: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b py-2 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-medium">{title}</span>
          <span className="text-muted-foreground tabular-nums"> · {meta}</span>
        </p>
        <EditGuideButton section={section} label={title.toLowerCase()} />
      </div>
      {note && <p className="text-sm text-amber-700 dark:text-amber-300">{note}</p>}
      {children}
    </div>
  );
}
