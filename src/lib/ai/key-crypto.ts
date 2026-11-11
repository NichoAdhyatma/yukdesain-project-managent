import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Enkripsi API key provider AI di database (docs/AI_PROVIDERS.md). Kunci AES-256-GCM dari env AI_KEYS_SECRET
// (32 byte, base64) yang hanya ada di server. Key tidak pernah dikirim ke browser maupun ditulis ke log.

export class KeyCryptoUnavailableError extends Error {
  constructor(message = "Kunci enkripsi AI_KEYS_SECRET belum diatur di server") {
    super(message);
    this.name = "KeyCryptoUnavailableError";
  }
}

function secretKey(): Buffer | null {
  const raw = process.env.AI_KEYS_SECRET?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

export function isKeyCryptoReady(): boolean {
  return secretKey() !== null;
}

/** `ciphertext` = base64(iv).base64(tag).base64(data); IV 12 byte acak. */
export function encryptApiKey(plain: string): { ciphertext: string; last4: string } {
  const key = secretKey();
  if (!key) throw new KeyCryptoUnavailableError();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: [iv, tag, data].map((b) => b.toString("base64")).join("."), last4: plain.slice(-4) };
}

export function decryptApiKey(ciphertext: string): string {
  const key = secretKey();
  if (!key) throw new KeyCryptoUnavailableError();
  try {
    const [iv, tag, data] = ciphertext.split(".").map((p) => Buffer.from(p, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    // Kunci server berganti atau data rusak: perlakukan sama (provider tidak bisa dipakai).
    throw new KeyCryptoUnavailableError("API key provider tidak bisa dibuka; kunci AI_KEYS_SECRET berbeda dari saat disimpan");
  }
}

/** Samarkan rahasia di teks error/log: pola sk-…, Bearer …, dan key provider itu sendiri. */
export function maskSecrets(text: string, extraSecrets: string[] = []): string {
  let out = text.replace(/sk-[\w-]+/g, "sk-***").replace(/Bearer\s+[\w.~+/=-]+/gi, "Bearer ***");
  for (const secret of extraSecrets) {
    if (secret && secret.length >= 6) out = out.split(secret).join("***");
  }
  return out;
}
