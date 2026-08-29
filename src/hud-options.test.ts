import { describe, expect, it } from "vitest";

import { hudOptions } from "./hud-options.js";

describe("hudOptions", () => {
  it("enables every HUD item by default", () => {
    expect(hudOptions({})).toEqual({
      agents: true,
      codexUsage: true,
      compaction: true,
      context: true,
      git: true,
      shell: true,
      tools: true,
    });
  });

  it("disables only explicitly false options", () => {
    expect(hudOptions({ agents: false, shell: false, tools: "no" })).toMatchObject({
      agents: false,
      shell: false,
      tools: true,
    });
  });
});
