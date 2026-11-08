import { describe, expect, it } from "vitest";
import { eventForStatusChange } from "./project-status-events";

describe("eventForStatusChange (docs/CLIENT_NOTIFICATIONS.md)", () => {
  it.each([
    ["BELUM_DIKERJAKAN", "SEDANG_DIKERJAKAN", { kind: "STARTED" }],
    ["DRAFT", "SEDANG_DIKERJAKAN", { kind: "STARTED" }],
    ["SELESAI", "SEDANG_DIKERJAKAN", { kind: "STARTED" }],
    ["SEDANG_DIKERJAKAN", "SELESAI", { kind: "COMPLETED" }],
    ["SEDANG_DIKERJAKAN", "SEDANG_DIKERJAKAN", null],
    ["SEDANG_DIKERJAKAN", "BELUM_DIKERJAKAN", null],
    ["SELESAI", "SELESAI", null],
  ] as const)("%s → %s", (from, to, expected) => {
    expect(eventForStatusChange(from, to)).toEqual(expected);
  });
});
