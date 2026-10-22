import { randomInt } from "node:crypto";

// Base32 Crockford-ish: no I, L, O, U so codes stay readable over the phone.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SUFFIX_LENGTH = 6;

export function generateProjectCode(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  let suffix = "";
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }

  return `PRJ-${yyyy}${mm}${dd}-${suffix}`;
}
