import { prisma } from "@/lib/db";
import { testAiConnection, type ConnectionCheck } from "@/lib/whatsapp/ai/connection-test";
import { getAiClient } from "./client";
import { maskSecrets } from "./key-crypto";
import { listProviders, resolveProvider } from "./providers";

// Hasil tes model per provider + syarat pakai (spec 2026-11-11 §4.3). Tes hanya sah untuk kredensial provider saat
// dites (credentialVersion); mengganti key / base URL membatalkannya.

export type AiUsage = "chat" | "proof" | "fallback";
type Capability = "connection" | "tools" | "image";

export const USAGE_REQUIREMENTS: Record<AiUsage, Capability[]> = {
  chat: ["connection", "tools"],
  proof: ["connection", "tools", "image"],
  fallback: ["connection", "tools"],
};

export const USAGE_LABELS: Record<AiUsage, string> = { chat: "Chat", proof: "Bukti transfer", fallback: "Cadangan" };

export class ModelNotTestedError extends Error {
  constructor(
    readonly usage: AiUsage,
    readonly missing: Capability[],
  ) {
    super(`Model belum lulus tes: ${missing.join(", ")}`);
    this.name = "ModelNotTestedError";
  }
}

type TestRow = { model: string; connectionOk: boolean; toolsOk: boolean; imageOk: boolean; testedAt: Date };

const capabilityOk = (t: TestRow, c: Capability) => (c === "connection" ? t.connectionOk : c === "tools" ? t.toolsOk : t.imageOk);
const usagesOf = (t: TestRow) => (Object.keys(USAGE_REQUIREMENTS) as AiUsage[]).filter((u) => USAGE_REQUIREMENTS[u].every((c) => capabilityOk(t, c)));

export async function runModelTest(providerKey: string, model: string) {
  const provider = await resolveProvider(providerKey);
  const claudeOptions = provider.format === "ANTHROPIC" && model.startsWith("claude-");
  const checks: ConnectionCheck[] = (await testAiConnection(getAiClient(provider), model, { claudeOptions })).map((c) => ({
    ...c,
    detail: maskSecrets(c.detail, [provider.apiKey]),
  }));
  const byName = (name: string) => checks.find((c) => c.name === name)?.ok ?? false;
  const test = { connectionOk: byName("Koneksi"), toolsOk: byName("Tool use"), imageOk: byName("Gambar"), testedAt: new Date() };
  await prisma.aiModelTest.create({
    data: { providerKey, model, ...test, details: checks, credentialVersion: provider.credentialVersion },
  });
  return { checks, test };
}

/** Model yang lulus untuk minimal satu pemakaian, dari tes terbaru per model pada kredensial sekarang. */
export async function passedTestsFor(providerKey: string, credentialVersion: string): Promise<{ model: string; usages: AiUsage[]; testedAt: Date }[]> {
  const rows: TestRow[] = await prisma.aiModelTest.findMany({
    where: { providerKey, credentialVersion },
    orderBy: { testedAt: "desc" },
  });
  const latest = new Map<string, TestRow>();
  for (const row of rows) if (!latest.has(row.model)) latest.set(row.model, row);
  return [...latest.values()].flatMap((t) => {
    const usages = usagesOf(t);
    return usages.length ? [{ model: t.model, usages, testedAt: t.testedAt }] : [];
  });
}

/** Tolak model yang belum lulus tes yang relevan pada kredensial provider sekarang. */
export async function assertUsable(usage: AiUsage, providerKey: string, model: string): Promise<void> {
  const provider = (await listProviders()).find((p) => p.key === providerKey);
  const required = USAGE_REQUIREMENTS[usage];
  if (!provider) throw new ModelNotTestedError(usage, required);
  const latest: TestRow | null = await prisma.aiModelTest.findFirst({
    where: { providerKey, model, credentialVersion: provider.credentialVersion },
    orderBy: { testedAt: "desc" },
  });
  const missing = latest ? required.filter((c) => !capabilityOk(latest, c)) : required;
  if (missing.length) throw new ModelNotTestedError(usage, missing);
}
