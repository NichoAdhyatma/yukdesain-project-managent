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

export async function createChatWithFallback(
  targets: { chat: AiTarget; fallback: AiTarget | null },
  params: ChatParams,
  now = new Date(),
): Promise<{ message: Anthropic.Message; usedFallback: boolean }> {
  try {
    return { message: await createWithTarget(targets.chat, params), usedFallback: false };
  } catch (error) {
    if (!targets.fallback || !isTechnicalFailure(error)) throw error;
    const reason = maskSecrets(String((error as Error).message ?? error)).slice(0, 120);
    console.warn(`[ai] provider utama gagal (${reason}), memakai cadangan`);
    const message = await createWithTarget(targets.fallback, params);
    if (now.getTime() - lastNotifyAt >= NOTIFY_INTERVAL_MS) {
      lastNotifyAt = now.getTime();
      void notifyOwnersPush("NEEDS_ADMIN", {
        title: "Provider utama gagal, memakai cadangan",
        body: `${targets.chat.model}: ${reason}. Cek Bot AI › Model.`,
        url: "/bot?tab=model",
        tag: "AI_FALLBACK",
      });
    }
    return { message, usedFallback: true };
  }
}
