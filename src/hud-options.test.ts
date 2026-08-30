import { describe, expect, it } from "vitest";

import { hudOptions } from "./hud-options.js";

describe("hudOptions", () => {
  it("enables native HUD items and disables Codex usage by default", () => {
    expect(hudOptions({})).toEqual({
      agents: true,
      codexUsage: false,
      compaction: true,
      context: true,
      git: true,
      shell: true,
      tools: true,
    });
  });

  it("accepts explicit booleans and defaults invalid options", () => {
    expect(hudOptions({ agents: false, codexUsage: true, shell: false, tools: "no" })).toMatchObject({
      agents: false,
      codexUsage: true,
      shell: false,
      tools: true,
    });
  });
});
