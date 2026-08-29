import { describe, expect, it } from "vitest";

import { codexUsageEnabled, codexUsageText, parseCodexUsage } from "./codex-usage.js";

describe("codexUsageEnabled", () => {
  it("requires an explicit opt-in", () => {
    expect(codexUsageEnabled({})).toBe(false);
    expect(codexUsageEnabled({ OPENCODE_HUD_CODEX_USAGE: "1" })).toBe(true);
  });
});

describe("parseCodexUsage", () => {
  it("maps the primary and weekly Codex windows", () => {
    expect(
      parseCodexUsage({
        rate_limit: {
          primary_window: { used_percent: 18.4 },
          secondary_window: { used_percent: 62.6 },
        },
      }),
    ).toEqual({ primaryPercent: 18, weeklyPercent: 63 });
  });

  it("rejects malformed or out-of-range usage", () => {
    expect(parseCodexUsage({ rate_limit: { primary_window: { used_percent: 101 } } })).toBeUndefined();
  });
});

describe("codexUsageText", () => {
  it("formats available windows without inventing missing values", () => {
    expect(codexUsageText({ primaryPercent: 18, weeklyPercent: 63 })).toBe("5h 18% · Week 63%");
    expect(codexUsageText({ weeklyPercent: 63 })).toBe("Week 63%");
  });
});
