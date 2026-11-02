import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signBody, verifySignature } from "./signature";

const secret = "app-secret";
const body = '{"object":"whatsapp_business_account","entry":[]}';
const valid = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("verifySignature", () => {
  it("menerima signature yang benar", () => {
    expect(verifySignature(body, valid, secret)).toBe(true);
    expect(verifySignature(body, valid.toUpperCase().replace("SHA256=", "sha256="), secret)).toBe(true);
  });

  it("signBody menghasilkan header yang valid", () => {
    expect(signBody(body, secret)).toBe(valid);
  });

  it.each([
    ["header kosong", null],
    ["tanpa prefix", valid.slice(7)],
    ["hex terlalu pendek", "sha256=abcd"],
    ["bukan hex", `sha256=${"z".repeat(64)}`],
  ])("menolak %s", (_label, header) => {
    expect(verifySignature(body, header, secret)).toBe(false);
  });

  it("menolak body yang diubah", () => {
    expect(verifySignature(body.replace("[]", "[{}]"), valid, secret)).toBe(false);
  });

  it("menolak secret yang salah", () => {
    expect(verifySignature(body, valid, "secret-lain")).toBe(false);
  });
});
