import { describe, expect, it } from "vitest";
import { buildStateBlock, type StateInput } from "./system-prompt";

const quoted = (dpPercent: number): StateInput => ({
  intake: {
    status: "QUOTED",
    service: { code: "SVC-01", name: "Logo Minimalis" },
    clientName: "Sari",
    clientEmail: null,
    briefDraft: {},
    missingRequired: [],
    writableFields: [],
    imageTargets: [],
    quote: { agreedPrice: 150000, dpAmount: 75000, dpPercent, deadline: new Date("2026-11-20T00:00:00Z") },
  },
  paymentAccounts: [],
  pendingImageMessageIds: [],
});

describe("buildStateBlock: DP dari snapshot order (docs/STUDIO_OPERATIONS.md)", () => {
  it("memakai persen order, bukan nilai Operasional saat ini", () => {
    expect(buildStateBlock(quoted(50))).toContain("DP 50%: Rp75.000");
    expect(buildStateBlock(quoted(30))).toContain("DP 30%: Rp75.000");
  });
});
