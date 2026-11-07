import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { AI_PROVIDERS, getProviderEnv, isAiConfigured } from "@/lib/whatsapp/env";
import { WA_CHANNELS, isChannelConfigured, type WaChannel } from "@/lib/whatsapp/channel";
import { aiModelSchema, aiProviderSchema, modelOverrides, providerOf } from "@/lib/whatsapp/ai/ai-config";
import { getModelProfile } from "@/lib/whatsapp/ai/model-profile";
import { getMonthlyUsage } from "@/lib/whatsapp/rate-limit";
import { WA_RATE_LIMITS } from "@/lib/constants";

// Pengaturan bot WhatsApp (owner). API key tidak pernah dikirim ke browser.

const select = {
  waBotEnabled: true,
  waChannel: true,
  waAiProvider: true,
  waAiModel: true,
  waAiExtractionModel: true,
  waAiGatewayModel: true,
  waAiGatewayExtractionModel: true,
  waBotMonthlyReplyCap: true,
} as const;

type Row = {
  waBotEnabled: boolean;
  waChannel: string;
  waAiProvider: string;
  waAiModel: string | null;
  waAiExtractionModel: string | null;
  waAiGatewayModel: string | null;
  waAiGatewayExtractionModel: string | null;
  waBotMonthlyReplyCap: number;
};

async function toDto(row: Row | null) {
  const provider = providerOf(row);
  const providers = AI_PROVIDERS.map((id) => {
    const env = getProviderEnv(id);
    const overrides = modelOverrides(row, id);
    return {
      id,
      label: env.label,
      configured: env.apiKey !== null,
      baseUrlHost: new URL(env.baseUrl).host,
      // null = default env
      model: overrides.model,
      extractionModel: overrides.extractionModel,
      defaults: { model: env.defaultModel, extractionModel: env.defaultExtractionModel },
    };
  });
  const active = providers.find((p) => p.id === provider)!;
  const effectiveModel = active.model || active.defaults.model;
  const channel: WaChannel = row?.waChannel === "FONNTE" ? "FONNTE" : "META";
  return {
    botEnabled: row?.waBotEnabled ?? false,
    // Saluran aktif siap menerima & mengirim (Meta: env Cloud API lengkap; Fonnte: token + bucket)
    whatsappConfigured: isChannelConfigured(channel),
    channel: {
      active: channel,
      options: WA_CHANNELS.map((id) => ({
        id,
        label: id === "FONNTE" ? "Fonnte (tidak resmi, testing)" : "Meta Cloud API (resmi)",
        configured: isChannelConfigured(id),
      })),
    },
    // Provider aktif punya key: cukup untuk Uji bot & Uji koneksi walau token WhatsApp belum ada
    aiConfigured: isAiConfigured(provider),
    ai: {
      provider,
      providers,
      effective: {
        label: active.label,
        model: effectiveModel,
        extractionModel: active.extractionModel || active.defaults.extractionModel,
        baseUrlHost: active.baseUrlHost,
      },
      modelRecognized: getModelProfile(effectiveModel).family !== null,
    },
    // Pemakaian bulan berjalan (WIB): kuota gratis Meta & peringatan §17
    usage: await getMonthlyUsage(),
  };
}

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
  channel: z.enum(["META", "FONNTE"]).optional(),
  aiProvider: aiProviderSchema.optional(),
  aiModel: nullable(aiModelSchema),
  aiExtractionModel: nullable(aiModelSchema),
  aiGatewayModel: nullable(aiModelSchema),
  aiGatewayExtractionModel: nullable(aiModelSchema),
  // Rem bulanan balasan bot (docs/WHATSAPP_SPAM_GUARD.md §3)
  monthlyReplyCap: z
    .number()
    .int("Harus bilangan bulat")
    .min(50, "Minimal 50")
    .max(WA_RATE_LIMITS.monthlyReplyCapMax, `Maksimal ${WA_RATE_LIMITS.monthlyReplyCapMax.toLocaleString("id-ID")}`)
    .optional(),
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
  if (input.aiProvider && !isAiConfigured(input.aiProvider)) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        fields: { aiProvider: `API key ${getProviderEnv(input.aiProvider).label} belum diisi di server` },
      },
      { status: 400 },
    );
  }

  if (input.channel && !isChannelConfigured(input.channel)) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        fields: {
          channel:
            input.channel === "FONNTE"
              ? "FONNTE_DEVICE_TOKEN, FONNTE_WEBHOOK_SECRET, atau bucket privat belum diisi di server"
              : "Env WhatsApp Cloud API belum lengkap di server",
        },
      },
      { status: 400 },
    );
  }

  const data: Partial<Row> = {
    ...(input.botEnabled !== undefined && { waBotEnabled: input.botEnabled }),
    ...(input.channel !== undefined && { waChannel: input.channel }),
    ...(input.aiProvider !== undefined && { waAiProvider: input.aiProvider }),
    ...(input.aiModel !== undefined && { waAiModel: input.aiModel }),
    ...(input.aiExtractionModel !== undefined && { waAiExtractionModel: input.aiExtractionModel }),
    ...(input.aiGatewayModel !== undefined && { waAiGatewayModel: input.aiGatewayModel }),
    ...(input.aiGatewayExtractionModel !== undefined && { waAiGatewayExtractionModel: input.aiGatewayExtractionModel }),
    ...(input.monthlyReplyCap !== undefined && { waBotMonthlyReplyCap: input.monthlyReplyCap }),
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
