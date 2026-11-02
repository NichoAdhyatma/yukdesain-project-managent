import { describe, expect, it } from "vitest";
import { getModelProfile, modelRequestOptions, parseClaudeModel } from "./model-profile";

describe("parseClaudeModel", () => {
  it.each([
    ["claude-haiku-5-5", "haiku", 5.5],
    ["claude-sonnet-4-6", "sonnet", 4.6],
    ["claude-opus-4-8", "opus", 4.8],
    ["claude-opus-4", "opus", 4],
    ["claude-sonnet-4-20250514", "sonnet", 4],
    ["claude-3-5-sonnet", "sonnet", 3.5],
    ["claude-3-5-haiku-20241022", "haiku", 3.5],
    ["claude-fable-5-1", "fable", 5.1],
    ["claude-opus-4-5@20251101", "opus", 4.5],
  ])("%s → %s %s", (id, family, version) => {
    expect(parseClaudeModel(id)).toEqual({ family, version });
  });

  it.each(["gpt-5.5", "claude", "claude-unknown-model", ""])("tidak dikenali: %j", (id) => {
    expect(parseClaudeModel(id)).toBeNull();
  });
});

describe("effort per model", () => {
  it.each([
    ["claude-haiku-5-5", true],
    ["claude-sonnet-5-5", true],
    ["claude-opus-5-5", true],
    ["claude-fable-5-1", true],
    ["claude-opus-4-8", true],
    ["claude-opus-4-5", true],
    ["claude-sonnet-4-6", true],
    ["claude-sonnet-4-5", false],
    ["claude-haiku-4-5", false],
    ["claude-opus-4-1", false],
    ["claude-3-5-sonnet", false],
    ["claude-model-baru-tak-dikenal", false],
  ])("%s → %s", (id, supported) => {
    expect(getModelProfile(id).supportsEffort).toBe(supported);
    expect(modelRequestOptions(id)).toEqual(supported ? { output_config: { effort: "low" } } : {});
  });
});
