import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/storage", () => ({ getClient: () => ({}) }));

import { toListItem } from "./intake-api";

const row = (waId: string) =>
  ({
    id: "in_1",
    status: "COLLECTING",
    clientName: null,
    agreedPrice: null,
    dpAmount: null,
    deadline: null,
    updatedAt: new Date(),
    service: null,
    _count: { paymentProofs: 0 },
    conversation: { waId, profileName: "Nico", lastInboundAt: new Date(), mode: "BOT", blockedAt: null, _count: { ownerQueries: 0 } },
  }) as unknown as Parameters<typeof toListItem>[0];

describe("toListItem — tes owner (docs/WHATSAPP_OWNER_COMMANDS.md §9)", () => {
  it("order dari nomor owner ditandai tes owner", () => {
    const owners = new Set(["6289700000000"]);
    expect(toListItem(row("6289700000000"), true, owners).ownerTest).toBe(true);
    expect(toListItem(row("6281234567890"), true, owners).ownerTest).toBe(false);
    expect(toListItem(row("6289700000000")).ownerTest).toBe(false);
  });
});
