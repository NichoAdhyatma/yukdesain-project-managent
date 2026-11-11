"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiModelSettings } from "@/components/settings/ai/AiModelSettings";
import { BotBrainCard } from "@/components/settings/whatsapp/BotBrainCard";
import { BotGuideCard } from "@/components/settings/whatsapp/BotGuideCard";
import { BotSandboxCard } from "@/components/settings/whatsapp/BotSandboxCard";
import { KirimiKnowledgeCard } from "@/components/settings/whatsapp/KirimiKnowledgeCard";

// Bot AI (docs/BOT_AI_PAGE.md): semua yang menyangkut otak bot, terpisah dari Settings › WhatsApp.
// Tab aktif ada di URL (?tab=…); ?bagian=… menggulir ke bagian Panduan (dipakai tombol Ubah di Otak bot).

const TABS = [
  { id: "otak", label: "Otak bot" },
  { id: "panduan", label: "Panduan" },
  { id: "uji", label: "Uji bot" },
  { id: "model", label: "Model AI" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function BotPage() {
  return (
    <Suspense>
      <BotContent />
    </Suspense>
  );
}

function BotContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const activeTab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : "otak";
  const section = searchParams.get("bagian");

  // Gulir ke bagian Panduan setelah kartunya selesai dimuat, lalu hapus ?bagian dari URL.
  useEffect(() => {
    if (activeTab !== "panduan" || !section) return;
    let frame = 0;
    const started = Date.now();
    const tryScroll = () => {
      const el = document.getElementById(`wa-guide-section-${section}`);
      if (el) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        // Kolom isian didahulukan; tombol (mis. Hapus) hanya jika bagiannya masih kosong.
        (el.querySelector<HTMLElement>("textarea, input:not([type=file])") ?? el.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
        router.replace("/bot?tab=panduan", { scroll: false });
      } else if (Date.now() - started < 5000) {
        frame = requestAnimationFrame(tryScroll);
      }
    };
    frame = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(frame);
  }, [activeTab, section, router]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-4 border-b border-border p-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Bot AI</h1>
          <p className="text-muted-foreground">Pengetahuan, panduan, uji coba, dan model AI bot WhatsApp</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Tabs
          value={activeTab}
          onValueChange={(value) => router.replace(`/bot?tab=${value}`, { scroll: false })}
          className="w-full max-w-6xl"
        >
          <TabsList className="h-auto! w-full flex-wrap justify-start gap-1 sm:w-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="h-7 flex-none">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="otak" className="mt-4 space-y-4">
            <BotBrainCard />
            <KirimiKnowledgeCard />
          </TabsContent>
          <TabsContent value="panduan" className="mt-4 max-w-3xl">
            <BotGuideCard />
          </TabsContent>
          <TabsContent value="uji" className="mt-4 max-w-3xl">
            <BotSandboxCard />
          </TabsContent>
          <TabsContent value="model" className="mt-4 max-w-3xl">
            <ModelTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/** Model AI: provider dari portal, tes model, dan pemakaian (docs/AI_PROVIDERS.md). */
function ModelTab() {
  return <AiModelSettings />;
}
