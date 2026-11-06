import { prisma } from "@/lib/db";
import { getWhatsAppEnv, isFonnteConfigured, isWhatsAppConfigured } from "./env";
import { WhatsAppApiError, markAsRead, sendTemplate, sendText } from "./client-api";
import { FonnteApiError, fonnteSendText } from "./fonnte";

// Saluran WhatsApp aktif (docs/WHATSAPP_CHANNEL_FONNTE.md): META = Cloud API resmi (aturan 24 jam &
// template), FONNTE = gateway scan QR untuk testing (selalu teks). Dipilih owner di Settings.

export type WaChannel = "META" | "FONNTE";
export const WA_CHANNELS: WaChannel[] = ["META", "FONNTE"];

export async function getChannel(): Promise<WaChannel> {
  // Dibaca tanpa cache: pindah saluran harus langsung berlaku.
  const row = await prisma.studioSettings.findUnique({ where: { id: "default" }, select: { waChannel: true } });
  return row?.waChannel === "FONNTE" ? "FONNTE" : "META";
}

export function isChannelConfigured(channel: WaChannel): boolean {
  return channel === "FONNTE" ? isFonnteConfigured() && !!process.env.STORAGE_PRIVATE_BUCKET?.trim() : isWhatsAppConfigured();
}

/** Aturan jendela 24 jam & template hanya berlaku untuk Cloud API Meta. */
export function usesServiceWindow(channel: WaChannel): boolean {
  return channel === "META";
}

export async function sendTextOnChannel(to: string, body: string, channel?: WaChannel): Promise<string> {
  return (channel ?? (await getChannel())) === "FONNTE" ? fonnteSendText(to, body) : sendText(to, body);
}

/**
 * Pesan yang di Meta butuh template di luar 24 jam. Fonnte tidak punya template → kirim teksnya.
 * `via` dipakai untuk mencatat jenis pesan.
 */
export async function sendTemplateOnChannel(
  to: string,
  template: { name: string; params: string[] },
  text: string,
  channel?: WaChannel,
): Promise<{ id: string; via: "text" | "template" }> {
  if ((channel ?? (await getChannel())) === "FONNTE") return { id: await fonnteSendText(to, text), via: "text" };
  const lang = getWhatsAppEnv().WHATSAPP_TEMPLATE_LANG;
  return { id: await sendTemplate(to, template.name, lang, template.params), via: "template" };
}

/** Centang biru: Meta lewat API; Fonnte memakai autoread perangkat (dipasang bersama webhook). */
export async function markAsReadOnChannel(wamid: string): Promise<void> {
  if (wamid.startsWith("fonnte:")) return;
  await markAsRead(wamid);
}

/** Kode error untuk WaMessage.errorCode (tanpa isi pesan/nomor). */
export function deliveryErrorCode(error: unknown): string {
  if (error instanceof WhatsAppApiError) return error.code ?? String(error.status);
  if (error instanceof FonnteApiError) return "FONNTE_FAILED";
  return "SEND_FAILED";
}
