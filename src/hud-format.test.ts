import { describe, expect, it } from "vitest";

import {
  compactionWarning,
  contextPercent,
  contextUsage,
  elapsedTime,
  gitSummary,
  modelRef,
  toolActivity,
  type ContextInput,
} from "./hud-format.js";

const context = (input: Partial<ContextInput>): ContextInput => ({
  messages: [],
  models: [],
  ...input,
});

describe("modelRef", () => {
  it("uses the latest assistant model when the session model is unavailable", () => {
    expect(
      modelRef(undefined, [{ type: "assistant", model: { providerID: "anthropic", id: "claude-sonnet" } }]),
    ).toEqual({ providerID: "anthropic", id: "claude-sonnet" });
  });
});

describe("contextUsage", () => {
  it("uses input, output, reasoning, and cached tokens against the model limit", () => {
    expect(
      contextUsage(
        context({
          model: { providerID: "openai", id: "gpt-5.6" },
          models: [{ providerID: "openai", id: "gpt-5.6", limit: { context: 100_000 } }],
          messages: [
            {
              type: "assistant",
              tokens: { input: 35_000, output: 2_000, reasoning: 3_000, cache: { read: 10_000, write: 0 } },
            },
          ],
        }),
      ),
    ).toBe("Context ████████░░░░░░░░ 50%  50k / 100k");
  });

  it("caps context usage at 100 percent", () => {
    expect(
      contextUsage(
        context({
          model: { providerID: "openai", id: "gpt-5.6" },
          models: [{ providerID: "openai", id: "gpt-5.6", limit: { context: 10 } }],
          messages: [
            { type: "assistant", tokens: { input: 11, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
          ],
        }),
      ),
    ).toBe("Context ████████████████ 100%  11 / 10");
  });

  it("uses the token-bearing assistant model after a session model switch", () => {
    expect(
      contextUsage(
        context({
          model: { providerID: "openai", id: "new-model" },
          models: [
            { providerID: "openai", id: "old-model", limit: { context: 100 } },
            { providerID: "openai", id: "new-model", limit: { context: 20 } },
          ],
          messages: [
            {
              type: "assistant",
              model: { providerID: "openai", id: "old-model" },
              tokens: { input: 50, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            },
          ],
        }),
      ),
    ).toBe("Context ████████░░░░░░░░ 50%  50 / 100");
  });

  it("keeps the latest completed usage while a newer assistant message streams", () => {
    expect(
      contextUsage(
        context({
          model: { providerID: "openai", id: "gpt-5.6" },
          models: [{ providerID: "openai", id: "gpt-5.6", limit: { context: 100 } }],
          messages: [
            { type: "assistant", tokens: { input: 25, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
            { type: "assistant" },
          ],
        }),
      ),
    ).toBe("Context ████░░░░░░░░░░░░ 25%  25 / 100");
  });

  it("omits usage without a matching model or assistant token usage", () => {
    expect(contextUsage(context({ messages: [{ type: "assistant" }] }))).toBeUndefined();
  });

  it("omits usage with invalid token values", () => {
    expect(
      contextUsage(
        context({
          model: { providerID: "openai", id: "gpt-5.6" },
          models: [{ providerID: "openai", id: "gpt-5.6", limit: { context: 10 } }],
          messages: [
            { type: "assistant", tokens: { input: Number.NaN, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
          ],
        }),
      ),
    ).toBeUndefined();
  });
});

describe("contextPercent", () => {
  it("returns native usage as a compact percentage", () => {
    expect(
      contextPercent(
        context({
          model: { providerID: "openai", id: "gpt-5.6" },
          models: [{ providerID: "openai", id: "gpt-5.6", limit: { context: 100_000 } }],
          messages: [
            {
              type: "assistant",
              tokens: { input: 35_000, output: 2_000, reasoning: 3_000, cache: { read: 10_000, write: 0 } },
            },
          ],
        }),
      ),
    ).toBe(50);
  });

  it("omits the percentage when usage cannot be derived", () => {
    expect(contextPercent(context({ messages: [{ type: "assistant" }] }))).toBeUndefined();
  });
});

describe("compactionWarning", () => {
  it("warns when context usage reaches 80 percent", () => {
    expect(compactionWarning(79)).toBe(false);
    expect(compactionWarning(80)).toBe(true);
    expect(compactionWarning(100)).toBe(true);
  });

  it("omits the warning without a valid context percentage", () => {
    expect(compactionWarning(undefined)).toBe(false);
    expect(compactionWarning(Number.NaN)).toBe(false);
  });
});

describe("gitSummary", () => {
  it("formats line and file-change totals", () => {
    expect(
      gitSummary([
        { status: "modified", additions: 2, deletions: 1 },
        { status: "added", additions: 3, deletions: 0 },
        { status: "deleted", additions: 0, deletions: 4 },
      ]),
    ).toBe("+5 -5 M1 A1 D1");
  });

  it("omits a clean worktree", () => {
    expect(gitSummary([])).toBeUndefined();
  });
});

describe("toolActivity", () => {
  it("groups tool activity by state and name", () => {
    expect(
      toolActivity([
        { name: "Read", state: { status: "completed" } },
        { name: "Read", state: { status: "completed" } },
        { name: "Edit", state: { status: "running" } },
        { name: "Bash", state: { status: "error" } },
      ]),
    ).toEqual([
      { name: "Read", status: "completed", count: 2 },
      { name: "Edit", status: "running", count: 1 },
      { name: "Bash", status: "error", count: 1 },
    ]);
  });

  it("keeps a repeated latest tool at the end of the activity list", () => {
    expect(
      toolActivity([
        { name: "Read", state: { status: "completed" } },
        { name: "Bash", state: { status: "completed" } },
        { name: "Edit", state: { status: "completed" } },
        { name: "Write", state: { status: "completed" } },
        { name: "Glob", state: { status: "completed" } },
        { name: "Read", state: { status: "completed" } },
      ]),
    ).toEqual([
      { name: "Bash", status: "completed", count: 1 },
      { name: "Edit", status: "completed", count: 1 },
      { name: "Write", status: "completed", count: 1 },
      { name: "Glob", status: "completed", count: 1 },
      { name: "Read", status: "completed", count: 2 },
    ]);
  });
});

describe("elapsedTime", () => {
  it("formats elapsed time in compact units", () => {
    expect(elapsedTime(59_900)).toBe("59s");
    expect(elapsedTime(61_000)).toBe("1m 1s");
    expect(elapsedTime(3_661_000)).toBe("1h 1m");
  });
});
