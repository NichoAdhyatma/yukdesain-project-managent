import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { getAiEnvDefaults, isWhatsAppConfigured } from "@/lib/whatsapp/env";
import { aiBaseUrlSchema, aiModelSchema } from "@/lib/whatsapp/ai/ai-config";
import { getModelProfile } from "@/lib/whatsapp/ai/model-profile";
import { getMonthlyUsage } from "@/lib/whatsapp/rate-limit";

// Pengaturan bot WhatsApp (owner). API key tidak pernah dikirim ke browser.

type Overrides = { waBotEnabled: boolean; waAiModel: string | null; waAiExtractionModel: string | null; waAiBaseUrl: string | null };

async function toDto(row: Overrides | null) {
  const defaults = getAiEnvDefaults();
  const model = row?.waAiModel || defaults?.model || null;
  return {
    botEnabled: row?.waBotEnabled ?? false,
    whatsappConfigured: isWhatsAppConfigured(),
    ai: {
      model: row?.waAiModel ?? null,
      extractionModel: row?.waAiExtractionModel ?? null,
      baseUrl: row?.waAiBaseUrl ?? null,
      defaults,
      effective: {
        model,
        extractionModel: row?.waAiExtractionModel || defaults?.extractionModel || null,
        baseUrl: row?.waAiBaseUrl || defaults?.baseUrl || null,
      },
      modelRecognized: model ? getModelProfile(model).family !== null : false,
    },
    // Pemakaian bulan berjalan (WIB): kuota gratis Meta & peringatan §17
    usage: await getMonthlyUsage(),
  };
}

const select = { waBotEnabled: true, waAiModel: true, waAiExtractionModel: true, waAiBaseUrl: true } as const;

export async function GET() {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const row = await prisma.studioSettings.findUnique({ where: { id: "default" }, select });
  return NextResponse.json(await toDto(row));
}

// "" atau null = kembali ke default env.
// preprocess (bukan union) supaya pesan error asli skema yang sampai ke form.
const nullable = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? null : v), schema.nullable()).optional();

const updateSchema = z.object({
  botEnabled: z.boolean().optional(),
  aiModel: nullable(aiModelSchema),
  aiExtractionModel: nullable(aiModelSchema),
  aiBaseUrl: nullable(aiBaseUrlSchema),
});

export async function PUT(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])),
      },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const data: Partial<Overrides> = {
    ...(input.botEnabled !== undefined && { waBotEnabled: input.botEnabled }),
    ...(input.aiModel !== undefined && { waAiModel: input.aiModel }),
    ...(input.aiExtractionModel !== undefined && { waAiExtractionModel: input.aiExtractionModel }),
    ...(input.aiBaseUrl !== undefined && { waAiBaseUrl: input.aiBaseUrl }),
  };

  const before = await prisma.studioSettings.findUnique({ where: { id: "default" }, select });
  const row = await prisma.studioSettings.upsert({
    where: { id: "default" },
    update: data,
    create: { id: "default", ...data },
    select,
  });

  await prisma.activityLog.create({
    data: {
      entityType: "StudioSettings",
      entityId: "default",
      action: "WHATSAPP_SETTINGS_UPDATED",
      actorId: auth.user.id,
      previousValue: before ?? undefined,
      newValue: row,
    },
  });

  return NextResponse.json(await toDto(row));
}
