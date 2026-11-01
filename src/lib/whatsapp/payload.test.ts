import { describe, expect, it } from "vitest";
import { parseWebhook } from "./payload";

const PHONE_ID = "1234567890";

function webhook(value: Record<string, unknown>, field = "messages") {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field,
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "628111", phone_number_id: PHONE_ID },
              ...value,
            },
          },
        ],
      },
    ],
  };
}

const contacts = [{ profile: { name: "Budi" }, wa_id: "6281234567890" }];

describe("parseWebhook", () => {
  it("pesan teks", () => {
    const parsed = parseWebhook(
      webhook({
        contacts,
        messages: [
          { from: "6281234567890", id: "wamid.1", timestamp: "1793500000", type: "text", text: { body: "Halo" } },
        ],
      }),
      PHONE_ID,
    );
    expect(parsed?.messages).toEqual([
      {
        wamid: "wamid.1",
        waId: "6281234567890",
        profileName: "Budi",
        sentAt: new Date(1793500000 * 1000),
        type: "text",
        body: "Halo",
      },
    ]);
  });

  it("pesan gambar dengan caption", () => {
    const parsed = parseWebhook(
      webhook({
        contacts,
        messages: [
          {
            from: "6281234567890",
            id: "wamid.2",
            timestamp: "1793500000",
            type: "image",
            image: { id: "MEDIA_1", mime_type: "image/jpeg", sha256: "abc=", caption: "referensi" },
          },
        ],
      }),
      PHONE_ID,
    );
    expect(parsed?.messages[0]).toMatchObject({
      type: "image",
      mediaId: "MEDIA_1",
      mimeType: "image/jpeg",
      sha256: "abc=",
      caption: "referensi",
    });
  });

  it("tipe lain menjadi unsupported", () => {
    const parsed = parseWebhook(
      webhook({
        messages: [
          { from: "6281234567890", id: "wamid.3", timestamp: "1793500000", type: "audio", audio: { id: "A" } },
        ],
      }),
      PHONE_ID,
    );
    expect(parsed?.messages[0]).toMatchObject({ type: "unsupported", originalType: "audio", profileName: null });
  });

  it("status pengiriman, termasuk kode error", () => {
    const parsed = parseWebhook(
      webhook({
        statuses: [
          { id: "wamid.out1", status: "delivered", timestamp: "1793500000", recipient_id: "628" },
          { id: "wamid.out2", status: "failed", timestamp: "1793500000", recipient_id: "628", errors: [{ code: 131047, title: "Re-engagement" }] },
        ],
      }),
      PHONE_ID,
    );
    expect(parsed?.statuses).toEqual([
      { wamid: "wamid.out1", status: "delivered", errorCode: null },
      { wamid: "wamid.out2", status: "failed", errorCode: "131047" },
    ]);
  });

  it("memproses semua entry dan change dalam satu batch", () => {
    const one = webhook({
      messages: [{ from: "628111", id: "wamid.a", timestamp: "1", type: "text", text: { body: "a" } }],
    });
    const two = webhook({
      messages: [{ from: "628222", id: "wamid.b", timestamp: "2", type: "text", text: { body: "b" } }],
    });
    const batch = { ...one, entry: [...one.entry, ...two.entry] };
    expect(parseWebhook(batch, PHONE_ID)?.messages.map((m) => m.wamid)).toEqual(["wamid.a", "wamid.b"]);
  });

  it("mengabaikan phone_number_id lain dan field selain messages", () => {
    const other = webhook({
      metadata: { display_phone_number: "1", phone_number_id: "999" },
      messages: [{ from: "628", id: "wamid.x", timestamp: "1", type: "text", text: { body: "x" } }],
    });
    expect(parseWebhook(other, PHONE_ID)).toEqual({ messages: [], statuses: [] });
    expect(parseWebhook(webhook({ event: "APPROVED" }, "message_template_status_update"), PHONE_ID)).toEqual({
      messages: [],
      statuses: [],
    });
  });

  it("bukan webhook WhatsApp → null", () => {
    expect(parseWebhook({ object: "page", entry: [] }, PHONE_ID)).toBeNull();
    expect(parseWebhook("halo", PHONE_ID)).toBeNull();
  });
});
