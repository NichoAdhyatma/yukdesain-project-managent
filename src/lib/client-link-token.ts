import { randomBytes } from "crypto";

// Token link klien: 16 karakter hex acak (AGENTS.md §21). Dipakai POST /api/client-links
// dan approve order WhatsApp, supaya formatnya satu.
export function generateClientLinkToken(length = 16): string {
  return randomBytes(length).toString("hex").slice(0, length);
}
