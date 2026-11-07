import { describe, expect, it } from "vitest";
import { OPERATIONS_DEFAULTS } from "@/lib/studio-operations";
import { HANDOFF_IN_HOURS, handoffReply } from "./handoff-reply";

describe("handoffReply (docs/STUDIO_OPERATIONS.md)", () => {
  it("dalam jam kerja → teks handoff biasa", () => {
    expect(handoffReply(OPERATIONS_DEFAULTS, new Date("2026-11-09T02:30:00Z"))).toBe(HANDOFF_IN_HOURS);
    expect(HANDOFF_IN_HOURS).toBe("Baik kak, percakapan ini kami teruskan ke admin. Admin kami akan membalas secepatnya ya.");
  });

  it("di luar jam kerja (Minggu) → catatan owner + jam kerja", () => {
    expect(handoffReply(OPERATIONS_DEFAULTS, new Date("2026-11-08T03:00:00Z"))).toBe(
      "Baik kak, percakapan ini kami teruskan ke admin. Admin membalas di jam kerja berikutnya. (Jam kerja: Senin–Sabtu, 09.00–17.00 WIB)",
    );
  });
});
