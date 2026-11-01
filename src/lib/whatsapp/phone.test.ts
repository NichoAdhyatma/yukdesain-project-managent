import { describe, expect, it } from "vitest";
import { maskPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["081234567890", "6281234567890"],
    ["81234567890", "6281234567890"],
    ["6281234567890", "6281234567890"],
    ["+62 812-3456-7890", "6281234567890"],
    ["(0812) 3456 7890", "6281234567890"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([null, undefined, "", "abc", "15551234567", "0812", "62812345678901234"])(
    "%s → null",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});

describe("maskPhone", () => {
  it("menyembunyikan bagian tengah nomor", () => {
    expect(maskPhone("6281234567890")).toBe("6281****7890");
  });

  it("nomor pendek disembunyikan seluruhnya", () => {
    expect(maskPhone("12345")).toBe("****");
  });
});
