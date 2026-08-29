const BAR_WIDTH = 16;
const BLOCK_EMPTY = "░";
const BLOCK_FILLED = "█";

export type AssistantMessage = {
  readonly model?: ModelRef;
  readonly tokens?: TokenUsage;
  readonly type: "assistant";
};

export type ContextInput = {
  readonly messages: readonly Message[];
  readonly model?: ModelRef;
  readonly models: readonly ContextModel[];
};

export type ContextModel = {
  readonly id: string;
  readonly limit: { readonly context: number };
  readonly providerID: string;
};

export type Message = AssistantMessage | { readonly type: string };

export type ModelRef = {
  readonly id: string;
  readonly providerID: string;
};

export type TokenUsage = {
  readonly cache: { readonly read: number; readonly write: number };
  readonly input: number;
  readonly output: number;
  readonly reasoning: number;
};

export type Tool = {
  readonly name: string;
  readonly state: { readonly status: "streaming" | "running" | "completed" | "error" };
};

export type ToolActivity = {
  readonly count: number;
  readonly name: string;
  readonly status: "completed" | "error" | "running";
};

export type VcsFile = {
  readonly additions: number;
  readonly deletions: number;
  readonly status: "added" | "deleted" | "modified";
};

// contextUsage formats the latest native token usage against the model context limit.
export function contextUsage(input: ContextInput): string | undefined {
  const message = latestAssistantWithTokens(input.messages);
  let modelRef = input.model;
  if (message?.model) {
    modelRef = message.model;
  }

  const model = selectedModel(modelRef, input.models);

  if (!model || !message?.tokens || !positive(model.limit.context)) {
    return undefined;
  }

  const used =
    message.tokens.input +
    message.tokens.output +
    message.tokens.reasoning +
    message.tokens.cache.read +
    message.tokens.cache.write;
  if (!nonNegative(used)) {
    return undefined;
  }

  const percent = Math.min(100, Math.round((used / model.limit.context) * 100));

  return `Context ${bar(percent)} ${percent}%  ${formatTokens(used)} / ${formatTokens(model.limit.context)}`;
}

// modelRef returns the selected session model or the latest assistant model as a fallback.
export function modelRef(model: ModelRef | undefined, messages: readonly Message[]): ModelRef | undefined {
  if (model) {
    return model;
  }

  return latestAssistant(messages)?.model;
}

// gitSummary formats local file changes returned by OpenCode's VCS status endpoint.
export function gitSummary(files: readonly VcsFile[]): string | undefined {
  if (files.length === 0) {
    return undefined;
  }

  let additions = 0;
  let deletions = 0;
  let added = 0;
  let deleted = 0;
  let modified = 0;

  for (const file of files) {
    additions += file.additions;
    deletions += file.deletions;

    if (file.status === "added") added += 1;
    if (file.status === "deleted") deleted += 1;
    if (file.status === "modified") modified += 1;
  }

  const parts = [`+${additions}`, `-${deletions}`];
  if (modified > 0) parts.push(`M${modified}`);
  if (added > 0) parts.push(`A${added}`);
  if (deleted > 0) parts.push(`D${deleted}`);

  return parts.join(" ");
}

// toolActivity groups a session's tool parts by state and name for a compact HUD row.
export function toolActivity(tools: readonly Tool[]): readonly ToolActivity[] {
  const activities = new Map<string, { count: number; name: string; status: "completed" | "error" | "running" }>();

  for (const tool of tools) {
    const status = tool.state.status === "streaming" || tool.state.status === "running" ? "running" : tool.state.status;
    const key = `${status}:${tool.name}`;
    const existing = activities.get(key);
    if (existing) {
      activities.delete(key);
      activities.set(key, { ...existing, count: existing.count + 1 });
      continue;
    }

    activities.set(key, { name: tool.name, status, count: 1 });
  }

  return [...activities.values()];
}

export function elapsedTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function bar(percent: number): string {
  const filled = Math.round((percent / 100) * BAR_WIDTH);

  return `${BLOCK_FILLED.repeat(filled)}${BLOCK_EMPTY.repeat(BAR_WIDTH - filled)}`;
}

function formatTokens(tokens: number): string {
  if (tokens < 1_000) {
    return `${tokens}`;
  }

  if (tokens < 10_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }

  if (tokens < 1_000_000) {
    return `${Math.round(tokens / 1_000)}k`;
  }

  return `${(tokens / 1_000_000).toFixed(1)}m`;
}

function latestAssistant(messages: readonly Message[]): AssistantMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && isAssistant(message)) {
      return message;
    }
  }
}

function latestAssistantWithTokens(messages: readonly Message[]): AssistantMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && isAssistant(message) && message.tokens) {
      return message;
    }
  }
}

function isAssistant(message: Message): message is AssistantMessage {
  return message.type === "assistant";
}

function nonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function selectedModel(model: ModelRef | undefined, models: readonly ContextModel[]): ContextModel | undefined {
  if (!model) {
    return undefined;
  }

  for (const candidate of models) {
    if (candidate.providerID === model.providerID && candidate.id === model.id) {
      return candidate;
    }
  }
}
