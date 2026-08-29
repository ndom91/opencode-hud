import { describe, expect, it } from "vitest"

import { contextUsage, modelRef, type ContextInput } from "./hud-format.js"

const context = (input: Partial<ContextInput>): ContextInput => ({
  messages: [],
  models: [],
  ...input,
})

describe("modelRef", () => {
  it("uses the latest assistant model when the session model is unavailable", () => {
    expect(
      modelRef(undefined, [
        { type: "assistant", model: { providerID: "anthropic", id: "claude-sonnet" } },
      ]),
    ).toEqual({ providerID: "anthropic", id: "claude-sonnet" })
  })
})

describe("contextUsage", () => {
  it("uses input, output, reasoning, and cached tokens against the model limit", () => {
    expect(
      contextUsage(
        context({
          model: { providerID: "openai", id: "gpt-5.6" },
          models: [{ providerID: "openai", id: "gpt-5.6", limit: { context: 100_000 } }],
          messages: [
            { type: "assistant", tokens: { input: 35_000, output: 2_000, reasoning: 3_000, cache: { read: 10_000, write: 0 } } },
          ],
        }),
      ),
    ).toBe("Context ████████░░░░░░░░ 50%  50k / 100k")
  })

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
    ).toBe("Context ████████████████ 100%  11 / 10")
  })

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
    ).toBe("Context ████████░░░░░░░░ 50%  50 / 100")
  })

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
    ).toBe("Context ████░░░░░░░░░░░░ 25%  25 / 100")
  })

  it("omits usage without a matching model or assistant token usage", () => {
    expect(contextUsage(context({ messages: [{ type: "assistant" }] }))).toBeUndefined()
  })

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
    ).toBeUndefined()
  })
})
