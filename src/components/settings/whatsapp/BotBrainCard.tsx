"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
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
import { MarkdownView } from "@/components/ui/markdown-view";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { BRAIN_QUERY_KEY } from "./BotGuideCard";
import { KnowledgeMindMap } from "./KnowledgeMindMap";
import { buildBrainMap, type Brain, type BranchId, type BrainSource, type EditTarget, type MapBranch, type MapItem } from "./brain-map";

// Otak bot (docs/WHATSAPP_BOT_BRAIN_VIEW.md, docs/BOT_AI_PAGE.md §3): semua yang diketahui bot, hanya dibaca.
// Layar lebar: mind map + panel detail. Layar kecil: pohon buka-tutup. Keduanya dari buildBrainMap.

async function fetchBrain(source: BrainSource): Promise<Brain> {
  const res = await fetch(`/api/settings/whatsapp/brain?source=${source}`);
  if (!res.ok) throw new Error("Otak bot tidak bisa dimuat");
  return res.json();
}

const fmt = (n: number) => n.toLocaleString("id-ID");

const ICONS: Record<BranchId, ReactNode> = {
  studio: <Building2 className="h-4 w-4" />,
  services: <Layers className="h-4 w-4" />,
  pricing: <Tag className="h-4 w-4" />,
  flow: <Workflow className="h-4 w-4" />,
  rules: <ShieldCheck className="h-4 w-4" />,
  guide: <BookOpen className="h-4 w-4" />,
  capabilities: <Wrench className="h-4 w-4" />,
};

/** Tombol Ubah: tautan ke halaman lain, atau ke bagian Panduan di tab Panduan. */
function EditButton({ target, onNavigate }: { target: EditTarget; onNavigate?: () => void }) {
  const router = useRouter();
  const className = buttonVariants({ variant: "ghost", size: "sm", className: "max-md:h-11" });
  if (target.kind === "link") {
    return (
      <Link href={target.href} className={className} onClick={onNavigate}>
        Ubah
        <span className="sr-only"> {target.label}</span>
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        onNavigate?.();
        router.push(`/bot?tab=panduan&bagian=${target.section}`);
      }}
    >
      Ubah
      <span className="sr-only"> {target.label} di Panduan</span>
    </button>
  );
}

function ItemBody({ item }: { item: MapItem }) {
  if (!item.body) return null;
  return item.markdown ? (
    <MarkdownView>{item.body}</MarkdownView>
  ) : (
    <p className="text-sm whitespace-pre-wrap break-words">{item.body}</p>
  );
}

type Selection = { branch: BranchId; item?: string } | null;

export function BotBrainCard() {
  const [source, setSource] = useState<BrainSource>("published");
  const [showPrompt, setShowPrompt] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const wide = useMediaQuery("(min-width: 1280px)");
  const { data, isLoading, isError, refetch, isRefetching } = useQuery<Brain>({
    queryKey: [...BRAIN_QUERY_KEY, source],
    queryFn: () => fetchBrain(source),
  });
  const branches = useMemo(() => (data ? buildBrainMap(data) : []), [data]);

  const header = (
    <CardHeader>
      <CardTitle>Otak bot</CardTitle>
      <CardDescription>
        Semua yang diketahui bot saat membalas klien. Klik bagian mana pun untuk melihat isinya; tombol Ubah membuka
        tempat mengaturnya. Ingatan per percakapan (order dan brief yang sedang berjalan) tidak ditampilkan karena
        berbeda untuk setiap klien.
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
          <div className="h-80 w-full animate-pulse rounded-lg bg-muted" />
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

  const isDraft = data.source === "draft";
  const selectedBranch = selection ? branches.find((b) => b.id === selection.branch) : undefined;
  const selectedItem = selection?.item ? selectedBranch?.items.find((i) => i.id === selection.item) : undefined;

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
            <Button type="button" variant="outline" size="sm" className="max-md:h-11" onClick={() => setShowPrompt(true)}>
              <ScrollText className="h-4 w-4" aria-hidden="true" />
              Lihat isi lengkap
            </Button>
          </div>
        </div>

        {!isDraft && !data.published && (
          <p className="text-sm text-muted-foreground">
            Belum ada panduan terbit, jadi klien hanya mendapat aturan dasar, layanan, dan identitas studio. Pilih Draft
            untuk melihat yang sedang disiapkan.
          </p>
        )}

        {wide ? (
          <div className="overflow-x-auto rounded-lg border bg-muted/20 px-4">
            <KnowledgeMindMap
              center={`Bot ${data.studio.name}`}
              branches={branches}
              icons={ICONS}
              onSelect={(branch, item) => setSelection({ branch, item })}
            />
          </div>
        ) : (
          <BrainTree branches={branches} />
        )}
      </CardContent>

      <Sheet open={!!selectedBranch} onOpenChange={(open) => !open && setSelection(null)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
          {selectedBranch && (
            <DetailPanel
              branch={selectedBranch}
              item={selectedItem}
              onSelectItem={(id) => setSelection({ branch: selectedBranch.id, item: id })}
              onBack={() => setSelection({ branch: selectedBranch.id })}
              onNavigate={() => setSelection(null)}
            />
          )}
        </SheetContent>
      </Sheet>

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

/** Panel detail mind map: ringkasan cabang (daftar semua item) atau isi satu item. */
function DetailPanel({
  branch,
  item,
  onSelectItem,
  onBack,
  onNavigate,
}: {
  branch: MapBranch;
  item?: MapItem;
  onSelectItem: (id: string) => void;
  onBack: () => void;
  onNavigate: () => void;
}) {
  const group = item?.group ? branch.groups?.find((g) => g.id === item.group) : undefined;
  const edit = group?.edit ?? branch.edit;
  const note = group?.note ?? (item ? null : branch.note);
  return (
    <>
      <SheetHeader className="border-b p-4 pr-12">
        {item && (
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 mb-1 inline-flex w-fit items-center gap-1 rounded text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {branch.title}
          </button>
        )}
        <SheetTitle className="flex items-center gap-2 break-words">
          {!item && <span className="text-muted-foreground">{ICONS[branch.id]}</span>}
          {item ? item.title : branch.title}
        </SheetTitle>
        <SheetDescription>
          {item
            ? (item.subtitle ?? group?.title ?? branch.title)
            : `${branch.meta}${branch.locked ? " · dikunci, hanya dilihat" : ""}`}
        </SheetDescription>
        {note && <p className="text-sm text-amber-700 dark:text-amber-300">{note}</p>}
        {edit && (
          <div className="pt-1">
            <EditButton target={edit} onNavigate={onNavigate} />
          </div>
        )}
      </SheetHeader>

      <div className="flex-1 overflow-y-auto p-4">
        {item ? (
          item.body ? (
            <ItemBody item={item} />
          ) : (
            <p className="text-sm text-muted-foreground">Tidak ada isi tambahan.</p>
          )
        ) : (
          <div className="space-y-3">
            {branch.intro && <p className="text-sm">{branch.intro}</p>}
            {branch.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{branch.emptyText || "Kosong."}</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {branch.items.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => onSelectItem(it.id)}
                      className="flex min-h-11 w-full items-start gap-2 px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block break-words">{it.title}</span>
                        {it.subtitle && <span className="block break-words text-muted-foreground">{it.subtitle}</span>}
                      </span>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {branch.id === "guide" && <p className="text-sm text-muted-foreground">Aturan harga ada di cabang Harga.</p>}
          </div>
        )}
      </div>
    </>
  );
}

/** Tampilan pohon untuk layar kecil (mind map terlalu sempit di HP). */
function BrainTree({ branches }: { branches: MapBranch[] }) {
  const [open, setOpen] = useState<Set<BranchId>>(new Set());
  const allOpen = open.size === branches.length;
  const toggle = (id: BranchId) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        className="max-md:h-11"
        onClick={() => setOpen(allOpen ? new Set() : new Set(branches.map((b) => b.id)))}
      >
        {allOpen ? "Tutup semua" : "Buka semua"}
      </Button>
      <ul className="rounded-lg border px-2" aria-label="Isi otak bot">
        {branches.map((branch) => {
          const isOpen = open.has(branch.id);
          const panelId = `brain-${branch.id}`;
          return (
            <li key={branch.id} className="border-b last:border-b-0">
              <div className="flex items-center gap-1 py-1">
                <button
                  type="button"
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggle(branch.id)}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="shrink-0 text-muted-foreground">{ICONS[branch.id]}</span>
                  <span className="font-medium">{branch.title}</span>
                  {branch.locked && (
                    <>
                      <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="sr-only">dikunci</span>
                    </>
                  )}
                  <span className="ml-auto shrink-0 pl-2 text-muted-foreground tabular-nums">{branch.meta}</span>
                </button>
                {branch.edit && <EditButton target={branch.edit} />}
              </div>
              {branch.note && <p className="-mt-1 pb-2 pl-10 text-sm text-amber-700 dark:text-amber-300">{branch.note}</p>}
              {isOpen && (
                <div id={panelId} className="pb-3 pl-6">
                  {branch.intro && <p className="py-1.5 text-sm">{branch.intro}</p>}
                  {branch.groups ? (
                    branch.groups.map((g) => (
                      <div key={g.id} className="border-b py-2 last:border-b-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm">
                            <span className="font-medium">{g.title}</span>
                            <span className="text-muted-foreground tabular-nums"> · {g.meta}</span>
                          </p>
                          <EditButton target={g.edit} />
                        </div>
                        {g.note && <p className="text-sm text-amber-700 dark:text-amber-300">{g.note}</p>}
                        <TreeItems items={branch.items.filter((i) => i.group === g.id)} />
                      </div>
                    ))
                  ) : branch.items.length === 0 ? (
                    <p className="py-1.5 text-sm text-muted-foreground">{branch.emptyText}</p>
                  ) : (
                    <TreeItems items={branch.items} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TreeItems({ items }: { items: MapItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul>
      {items.map((item) =>
        item.body ? (
          <li key={item.id} className="text-sm">
            <details className="group rounded-md">
              <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2 rounded-md px-2 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block break-words">{item.title}</span>
                  {item.subtitle && <span className="block break-words text-muted-foreground">{item.subtitle}</span>}
                </span>
              </summary>
              <div className="mb-2 ml-8 rounded-md bg-muted/60 p-3">
                <ItemBody item={item} />
              </div>
            </details>
          </li>
        ) : (
          <li key={item.id} className="py-1.5 pl-2 text-sm">
            <p className="break-words">{item.title}</p>
            {item.subtitle && <p className="break-words text-muted-foreground">{item.subtitle}</p>}
          </li>
        ),
      )}
    </ul>
  );
}
