import { z } from "zod";

// Hanya field yang dipakai. Field lain dari Meta diabaikan (zod strip), dan tipe
// pesan/perubahan yang tidak dikenal tidak membuat seluruh payload gagal.

const contactSchema = z.object({
  wa_id: z.string(),
  profile: z.object({ name: z.string().optional() }).optional(),
});

const messageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  image: z
    .object({
      id: z.string(),
      mime_type: z.string().optional(),
      sha256: z.string().optional(),
      caption: z.string().optional(),
    })
    .optional(),
});

const statusSchema = z.object({
  id: z.string(),
  status: z.string(),
  timestamp: z.string(),
  errors: z.array(z.object({ code: z.number() })).optional(),
});

const messagesValueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string() }),
  contacts: z.array(contactSchema).optional(),
  messages: z.array(messageSchema).optional(),
  statuses: z.array(statusSchema).optional(),
});

const webhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      changes: z.array(z.object({ field: z.string(), value: z.unknown() })),
    }),
  ),
});

export type InboundMessage = {
  wamid: string;
  waId: string;
  profileName: string | null;
  sentAt: Date;
} & (
  | { type: "text"; body: string }
  | { type: "image"; mediaId: string; mimeType: string | null; sha256: string | null; caption: string | null }
  | { type: "unsupported"; originalType: string }
);

export type StatusUpdate = {
  wamid: string;
  status: string;
  errorCode: string | null;
};

export type ParsedWebhook = {
  messages: InboundMessage[];
  statuses: StatusUpdate[];
};

const fromUnixSeconds = (value: string) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
};

/**
 * Ubah body webhook menjadi daftar pesan masuk dan status pengiriman.
 * Perubahan untuk phone_number_id lain diabaikan. Return null jika bentuk payload
 * bukan webhook WhatsApp.
 */
export function parseWebhook(json: unknown, phoneNumberId: string): ParsedWebhook | null {
  const root = webhookSchema.safeParse(json);
  if (!root.success) return null;

  const result: ParsedWebhook = { messages: [], statuses: [] };

  for (const entry of root.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;
      const value = messagesValueSchema.safeParse(change.value);
      if (!value.success) continue;
      if (value.data.metadata.phone_number_id !== phoneNumberId) continue;

      const names = new Map(
        (value.data.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]),
      );

      for (const msg of value.data.messages ?? []) {
        const base = {
          wamid: msg.id,
          waId: msg.from,
          profileName: names.get(msg.from) ?? null,
          sentAt: fromUnixSeconds(msg.timestamp),
        };
        if (msg.type === "text" && msg.text) {
          result.messages.push({ ...base, type: "text", body: msg.text.body });
        } else if (msg.type === "image" && msg.image) {
          result.messages.push({
            ...base,
            type: "image",
            mediaId: msg.image.id,
            mimeType: msg.image.mime_type ?? null,
            sha256: msg.image.sha256 ?? null,
            caption: msg.image.caption ?? null,
          });
        } else {
          result.messages.push({ ...base, type: "unsupported", originalType: msg.type });
        }
      }

      for (const st of value.data.statuses ?? []) {
        result.statuses.push({
          wamid: st.id,
          status: st.status,
          errorCode: st.errors?.[0] ? String(st.errors[0].code) : null,
        });
      }
    }
  }

  return result;
}
