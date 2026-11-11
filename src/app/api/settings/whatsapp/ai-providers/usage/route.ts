import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { aiModelIdSchema } from "@/lib/ai/providers";
import { ModelNotTestedError, assertUsable, type AiUsage } from "@/lib/ai/model-tests";
import { CAPABILITY_LABELS } from "@/lib/ai/provider-admin";

// Pilihan model untuk Chat / Bukti transfer / Cadangan; hanya model yang lulus tes (spec 2026-11-11 §4.3).
// null = kembali ke bawaan (Chat/Bukti: provider env lama; Cadangan: tanpa cadangan).

const target = z.object({ providerKey: z.string().regex(/^(env:(ANTHROPIC|GATEWAY)|db:[a-z0-9]+)$/i), model: aiModelIdSchema }).nullable().optional();
const schema = z.object({ chat: target, proof: target, fallback: target });

const COLUMNS: Record<AiUsage, { key: "aiChatProviderKey" | "aiProofProviderKey" | "aiFallbackProviderKey"; model: "aiChatModel" | "aiProofModel" | "aiFallbackModel" }> = {
  chat: { key: "aiChatProviderKey", model: "aiChatModel" },
  proof: { key: "aiProofProviderKey", model: "aiProofModel" },
  fallback: { key: "aiFallbackProviderKey", model: "aiFallbackModel" },
};

export async function PUT(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Data tidak valid" }, { status: 400 });

  const fields: Record<string, string> = {};
  const data: Record<string, string | null> = {};
  for (const usage of Object.keys(COLUMNS) as AiUsage[]) {
    const value = parsed.data[usage];
    if (value === undefined) continue;
    if (value) {
      try {
        await assertUsable(usage, value.providerKey, value.model);
      } catch (error) {
        if (!(error instanceof ModelNotTestedError)) throw error;
        fields[usage] = `Model belum lulus tes: ${error.missing.map((c) => CAPABILITY_LABELS[c]).join(", ")}`;
        continue;
      }
    }
    data[COLUMNS[usage].key] = value?.providerKey ?? null;
    data[COLUMNS[usage].model] = value?.model ?? null;
  }
  if (Object.keys(fields).length) return NextResponse.json({ error: "VALIDATION_ERROR", fields }, { status: 400 });

  await prisma.studioSettings.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
  await prisma.activityLog.create({
    data: { entityType: "StudioSettings", entityId: "default", action: "AI_USAGE_UPDATED", actorId: auth.user.id, newValue: data },
  });
  return NextResponse.json({ ok: true });
}
