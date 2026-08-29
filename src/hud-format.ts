const BAR_WIDTH = 8
const BLOCK_EMPTY = "░"
const BLOCK_FILLED = "█"

export type AssistantMessage = {
  readonly model?: ModelRef
  readonly tokens?: TokenUsage
  readonly type: "assistant"
}

export type ContextInput = {
  readonly messages: readonly Message[]
  readonly model?: ModelRef
  readonly models: readonly ContextModel[]
}

export type ContextModel = {
  readonly id: string
  readonly limit: { readonly context: number }
  readonly providerID: string
}

export type Message = AssistantMessage | { readonly type: string }

export type ModelRef = {
  readonly id: string
  readonly providerID: string
}

export type TokenUsage = {
  readonly cache: { readonly read: number; readonly write: number }
  readonly input: number
  readonly output: number
  readonly reasoning: number
}

// contextUsage formats the latest native token usage against the model context limit.
export function contextUsage(input: ContextInput): string | undefined {
  const message = latestAssistant(input.messages)
  let modelRef = input.model
  if (message?.model) {
    modelRef = message.model
  }

  const model = selectedModel(modelRef, input.models)

  if (!model || !message?.tokens || !positive(model.limit.context)) {
    return undefined
  }

  const used = message.tokens.input + message.tokens.output + message.tokens.reasoning + message.tokens.cache.read + message.tokens.cache.write
  if (!nonNegative(used)) {
    return undefined
  }

  const percent = Math.min(100, Math.round((used / model.limit.context) * 100))

  return `ctx ${bar(percent)} ${percent}% ${formatTokens(used)}/${formatTokens(model.limit.context)}`
}

// formatCost returns a compact USD representation of a session total.
export function formatCost(cost: number): string | undefined {
  if (!nonNegative(cost)) {
    return undefined
  }

  return `$${cost.toFixed(2)}`
}

// formatModel returns the provider and model identifier for a selected model.
export function formatModel(model?: ModelRef): string | undefined {
  if (!model) {
    return undefined
  }

  return `${model.providerID}/${model.id}`
}

// modelRef returns the selected session model or the latest assistant model as a fallback.
export function modelRef(model: ModelRef | undefined, messages: readonly Message[]): ModelRef | undefined {
  if (model) {
    return model
  }

  return latestAssistant(messages)?.model
}

function bar(percent: number): string {
  const filled = Math.round((percent / 100) * BAR_WIDTH)

  return `${BLOCK_FILLED.repeat(filled)}${BLOCK_EMPTY.repeat(BAR_WIDTH - filled)}`
}

function formatTokens(tokens: number): string {
  if (tokens < 1_000) {
    return `${tokens}`
  }

  if (tokens < 10_000) {
    return `${(tokens / 1_000).toFixed(1)}k`
  }

  if (tokens < 1_000_000) {
    return `${Math.round(tokens / 1_000)}k`
  }

  return `${(tokens / 1_000_000).toFixed(1)}m`
}

function latestAssistant(messages: readonly Message[]): AssistantMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message && isAssistant(message)) {
      return message
    }
  }
}

function isAssistant(message: Message): message is AssistantMessage {
  return message.type === "assistant"
}

function nonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function selectedModel(model: ModelRef | undefined, models: readonly ContextModel[]): ContextModel | undefined {
  if (!model) {
    return undefined
  }

  for (const candidate of models) {
    if (candidate.providerID === model.providerID && candidate.id === model.id) {
      return candidate
    }
  }
}
