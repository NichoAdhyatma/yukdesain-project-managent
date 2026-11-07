// Bentuk respons & pemanggil /api/settings/whatsapp untuk komponen Settings › WhatsApp.

export type AiProviderId = "ANTHROPIC" | "GATEWAY";

export type WhatsAppUsage = {
  month: string;
  outboundSent: number;
  outboundFailed: number;
  templatesSent: number;
  botReplies: number;
  inbound: number;
  warningThreshold: number;
  freeTier: number;
  nearLimit: boolean;
};

export type WaChannelId = "META" | "FONNTE";

export type WhatsAppSettings = {
  botEnabled: boolean;
  whatsappConfigured: boolean;
  channel: { active: WaChannelId; options: { id: WaChannelId; label: string; configured: boolean }[] };
  aiConfigured: boolean;
  ai: {
    provider: AiProviderId;
    providers: {
      id: AiProviderId;
      label: string;
      configured: boolean;
      baseUrlHost: string;
      model: string | null;
      extractionModel: string | null;
      defaults: { model: string; extractionModel: string };
    }[];
    effective: { label: string; model: string; extractionModel: string; baseUrlHost: string };
    modelRecognized: boolean;
  };
  usage: WhatsAppUsage;
};

export const WHATSAPP_SETTINGS_KEY = ["settings", "whatsapp"];

export class SettingsApiError extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function putWhatsAppSettings(body: Record<string, unknown>): Promise<WhatsAppSettings> {
  const res = await fetch("/api/settings/whatsapp", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new SettingsApiError(data.error ?? "Gagal menyimpan", data.fields);
  return data;
}

export async function fetchWhatsAppSettings(): Promise<WhatsAppSettings> {
  const res = await fetch("/api/settings/whatsapp");
  if (!res.ok) throw new Error("Gagal memuat pengaturan WhatsApp");
  return res.json();
}
