import { prisma } from "@/lib/db";
import { USAGE_LABELS, USAGE_REQUIREMENTS, type AiUsage } from "./model-tests";
import type { AiTarget } from "./fallback";
import type { ProviderSummary } from "./providers";

// Data pendukung halaman Bot AI › Model: pemakaian tersimpan dan riwayat tes per provider (tanpa key).

export type AiUsageMap = Record<AiUsage, AiTarget | null>;

const pair = (key: string | null | undefined, model: string | null | undefined): AiTarget | null =>
  key && model ? { providerKey: key, model } : null;

export async function getUsage(): Promise<AiUsageMap> {
  const row = await prisma.studioSettings.findUnique({
    where: { id: "default" },
    select: {
      aiChatProviderKey: true,
      aiChatModel: true,
      aiProofProviderKey: true,
      aiProofModel: true,
      aiFallbackProviderKey: true,
      aiFallbackModel: true,
    },
  });
  return {
    chat: pair(row?.aiChatProviderKey, row?.aiChatModel),
    proof: pair(row?.aiProofProviderKey, row?.aiProofModel),
    fallback: pair(row?.aiFallbackProviderKey, row?.aiFallbackModel),
  };
}

/** Pemakaian yang menunjuk provider ini, mis. ["Chat", "Cadangan"]. */
export function usagesOfProvider(usage: AiUsageMap, providerKey: string): string[] {
  return (Object.keys(usage) as AiUsage[]).filter((u) => usage[u]?.providerKey === providerKey).map((u) => USAGE_LABELS[u]);
}

export type ModelTestView = {
  model: string;
  connectionOk: boolean;
  toolsOk: boolean;
  imageOk: boolean;
  details: unknown;
  testedAt: Date;
  stale: boolean;
  usages: AiUsage[];
};

/** Tes terbaru per provider + model; `stale` = dites dengan kredensial lama (perlu dites ulang). */
export async function testsByProvider(providers: ProviderSummary[]): Promise<Record<string, ModelTestView[]>> {
  const rows: {
    providerKey: string;
    model: string;
    connectionOk: boolean;
    toolsOk: boolean;
    imageOk: boolean;
    details: unknown;
    testedAt: Date;
    credentialVersion: string;
  }[] = await prisma.aiModelTest.findMany({ where: { providerKey: { in: providers.map((p) => p.key) } }, orderBy: { testedAt: "desc" } });
  const current = new Map(providers.map((p) => [p.key, p.credentialVersion]));
  const out: Record<string, ModelTestView[]> = Object.fromEntries(providers.map((p) => [p.key, []]));
  const seen = new Set<string>();
  for (const r of rows) {
    const id = `${r.providerKey}|${r.model}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const stale = current.get(r.providerKey) !== r.credentialVersion;
    const ok = { connection: r.connectionOk, tools: r.toolsOk, image: r.imageOk };
    const usages = stale ? [] : (Object.keys(USAGE_REQUIREMENTS) as AiUsage[]).filter((u) => USAGE_REQUIREMENTS[u].every((c) => ok[c]));
    out[r.providerKey]?.push({ model: r.model, connectionOk: r.connectionOk, toolsOk: r.toolsOk, imageOk: r.imageOk, details: r.details, testedAt: r.testedAt, stale, usages });
  }
  return out;
}

export const CAPABILITY_LABELS = { connection: "koneksi", tools: "tool", image: "gambar" } as const;
