import type Anthropic from "@anthropic-ai/sdk";
import { notifyOwnersPush } from "@/lib/notifications/push";
import { modelRequestOptions } from "@/lib/whatsapp/ai/model-profile";
import { getAiClient, isTechnicalFailure } from "./client";
import { maskSecrets } from "./key-crypto";
import { resolveProvider } from "./providers";

// Pemanggilan AI untuk Chat dengan provider cadangan (spec 2026-11-11 §5.5). Provider dibuka saat dipanggil, jadi
// gagal membuka key / provider hilang juga memicu cadangan.

export type AiTarget = { providerKey: string; model: string };

/** Notifikasi "memakai cadangan" paling banyak sekali per jam (satu proses Node di VPS). */
const NOTIFY_INTERVAL_MS = 60 * 60_000;
let lastNotifyAt = 0;

/** Untuk tes: kosongkan batas waktu notifikasi. */
export function resetFallbackNotifyThrottle(): void {
  lastNotifyAt = 0;
}

type ChatParams = Omit<Anthropic.MessageCreateParamsNonStreaming, "model">;

/** Satu panggilan ke satu target; opsi khusus Claude hanya untuk format Anthropic + model claude-…. */
export async function createWithTarget(target: AiTarget, params: ChatParams): Promise<Anthropic.Message> {
  const provider = await resolveProvider(target.providerKey);
  const options = modelRequestOptions(target.model, provider.format);
  return getAiClient(provider).create({ ...params, ...options, model: target.model });
}

function notifyFallback(targets: { chat: AiTarget }, reason: string, now: Date) {
  if (now.getTime() - lastNotifyAt < NOTIFY_INTERVAL_MS) return;
  lastNotifyAt = now.getTime();
  void notifyOwnersPush("NEEDS_ADMIN", {
    title: "Provider utama gagal, memakai cadangan",
    body: `${targets.chat.model}: ${reason}. Cek Bot AI › Model.`,
    url: "/bot?tab=model",
    tag: "AI_FALLBACK",
  });
}

/**
 * Sesi Chat untuk satu giliran bot (beberapa putaran tool). Setelah provider utama gagal secara teknis sekali, sisa
 * putaran langsung ke cadangan: tidak menunggu timeout utama berulang, dan satu giliran tidak mencampur provider.
 */
export function createChatSession(targets: { chat: AiTarget; fallback: AiTarget | null }, now = new Date()) {
  const session = {
    usedFallback: false,
    async create(params: ChatParams): Promise<Anthropic.Message> {
      if (session.usedFallback && targets.fallback) return createWithTarget(targets.fallback, params);
      try {
        return await createWithTarget(targets.chat, params);
      } catch (error) {
        if (!targets.fallback || !isTechnicalFailure(error)) throw error;
        const reason = maskSecrets(String((error as Error).message ?? error)).slice(0, 120);
        console.warn(`[ai] provider utama gagal (${reason}), memakai cadangan untuk giliran ini`);
        session.usedFallback = true;
        notifyFallback(targets, reason, now);
        return createWithTarget(targets.fallback, params);
      }
    },
  };
  return session;
}

/** Satu panggilan Chat dengan cadangan (tanpa sesi). */
export async function createChatWithFallback(
  targets: { chat: AiTarget; fallback: AiTarget | null },
  params: ChatParams,
  now = new Date(),
): Promise<{ message: Anthropic.Message; usedFallback: boolean }> {
  const session = createChatSession(targets, now);
  const message = await session.create(params);
  return { message, usedFallback: session.usedFallback };
}
