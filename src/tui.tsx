import { Plugin } from "@opencode-ai/plugin/tui";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { codexUsageEnabled, codexUsageText, loadCodexUsage, type CodexUsage } from "./codex-usage.js";
import {
  compactionWarning,
  contextPercent,
  contextUsage,
  elapsedTime,
  gitSummary,
  modelRef,
  recentToolFailure,
  toolActivity,
} from "./hud-format.js";
import { hudOptions, type HudOptions } from "./hud-options.js";

type GitStatusProps = {
  readonly branch?: string;
  readonly context: Plugin.Context;
};

type ToolActivityProps = {
  readonly messages: ReturnType<Plugin.Context["data"]["session"]["message"]["list"]>;
  readonly context: Plugin.Context;
};

type SessionMessage = ToolActivityProps["messages"][number];
type ShellMessage = Extract<SessionMessage, { readonly type: "shell" }>;

type AgentActivityProps = {
  readonly context: Plugin.Context;
  readonly sessionID: string;
};

type HudProps = {
  readonly context: Plugin.Context;
  readonly options: HudOptions;
  readonly sessionID?: string;
};

const TOOL_HISTORY_MESSAGE_LIMIT = 32;
const TOOL_HISTORY_PART_LIMIT = 24;
const CODEX_USAGE_REFRESH_MS = 30 * 60 * 1_000;
const CODEX_USAGE_TIMEOUT_MS = 10 * 1_000;

function GitStatus(props: GitStatusProps) {
  const [files, setFiles] = createSignal<
    readonly { additions: number; deletions: number; status: "added" | "deleted" | "modified" }[]
  >([]);

  onMount(() => {
    let active = true;
    let generation = 0;

    const refresh = async () => {
      const request = generation + 1;
      generation = request;
      const input = vcsInput(props.context);

      try {
        const status = await props.context.client.vcs.status(input);
        if (active && request === generation) {
          setFiles(status.data);
        }
      } catch (error) {
        if (active && request === generation) {
          setFiles([]);
        }
        console.error("OpenCode HUD VCS status failed", error);
      }
    };

    const refreshStatus = () => {
      void refresh();
    };

    refreshStatus();
    const stopFilesystem = props.context.data.on("filesystem.changed", refreshStatus);
    const stopVcs = props.context.data.on("vcs.branch.updated", refreshStatus);

    onCleanup(() => {
      active = false;
      stopFilesystem();
      stopVcs();
    });
  });

  const dirty = () => files().length > 0;
  const summary = () => gitSummary(files());

  return (
    <>
      <Show when={props.branch}>
        {(branch) => (
          <text
            flexShrink={1}
            fg={
              dirty()
                ? props.context.theme.text.feedback.warning.default
                : props.context.theme.text.feedback.success.default
            }
            minWidth={0}
            truncate
            wrapMode="none"
          >
            {branch()}
            <Show when={dirty()}>
              <span> *</span>
            </Show>
          </text>
        )}
      </Show>
      <Show when={!props.branch && dirty()}>
        <text fg={props.context.theme.text.feedback.warning.default}> *</text>
      </Show>
      <Show when={summary()}>
        {(value) => (
          <text flexShrink={1} fg={props.context.theme.text.subdued} minWidth={0} truncate wrapMode="none">
            {" "}
            {value()}
          </text>
        )}
      </Show>
    </>
  );
}

function ToolActivity(props: ToolActivityProps) {
  const activities = () => toolActivity(recentToolParts(props.messages));

  return (
    <Show when={activities().length > 0}>
      <box flexDirection="row" flexShrink={1} gap={1} minWidth={0}>
        <text flexShrink={0} fg={props.context.theme.text.subdued} wrapMode="none">
          Tools
        </text>
        <box flexDirection="row" flexShrink={1} gap={1} minWidth={0}>
          <For each={activities().slice(-4)}>
            {(activity) => (
              <text flexShrink={1} fg={toolColor(props.context, activity.status)} minWidth={0} truncate wrapMode="none">
                {toolMark(activity.status)} {activity.name}
                {activity.count > 1 ? ` ×${activity.count}` : ""}
              </text>
            )}
          </For>
        </box>
      </box>
    </Show>
  );
}

function ToolFailure(props: ToolActivityProps) {
  const [now, setNow] = createSignal(Date.now());
  const failure = () => recentToolFailure(latestToolParts(props.messages), now());

  onMount(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    onCleanup(() => clearInterval(timer));
  });

  return (
    <Show when={failure()}>
      {(tool) => (
        <text fg={props.context.theme.text.feedback.error.default} wrapMode="none">
          ! {tool().name} failed
        </text>
      )}
    </Show>
  );
}

function recentToolParts(messages: ToolActivityProps["messages"]) {
  const tools = [];
  const firstMessage = Math.max(0, messages.length - TOOL_HISTORY_MESSAGE_LIMIT);

  for (let messageIndex = messages.length - 1; messageIndex >= firstMessage; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message?.type !== "assistant") {
      continue;
    }

    for (let partIndex = message.content.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.content[partIndex];
      if (part?.type === "tool") {
        tools.push(part);
        if (tools.length === TOOL_HISTORY_PART_LIMIT) {
          return tools.reverse();
        }
      }
    }
  }

  return tools.reverse();
}

function latestToolParts(messages: ToolActivityProps["messages"]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.type === "assistant") {
      return message.content.filter((part) => part.type === "tool");
    }
  }

  return [];
}

function AgentActivity(props: AgentActivityProps) {
  const [now, setNow] = createSignal(Date.now());

  onMount(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);

    onCleanup(() => clearInterval(timer));
  });

  const agents = () =>
    props.context.data.session
      .family(props.sessionID)
      .map((id) => props.context.data.session.get(id))
      .filter(
        (agent): agent is NonNullable<typeof agent> =>
          agent !== undefined && agent.id !== props.sessionID && agent.parentID !== undefined,
      )
      .filter((agent) => props.context.data.session.status(agent.id) === "running")
      .sort((left, right) => right.time.updated - left.time.updated);
  const usage = (agent: ReturnType<typeof agents>[number]) => {
    const percent = contextPercent({
      model: agent.model,
      models: props.context.data.location.model.list(agent.location) ?? [],
      messages: props.context.data.session.message.list(agent.id),
    });

    return percent === undefined ? undefined : ` · Context ${percent}%`;
  };

  return (
    <Show when={agents().length > 0}>
      <box flexDirection="row" flexShrink={1} gap={1} minWidth={0}>
        <text flexShrink={0} fg={props.context.theme.text.subdued} wrapMode="none">
          Agents
        </text>
        <box flexDirection="column" flexShrink={1} minWidth={0}>
          <For each={agents().slice(0, 3)}>
            {(agent) => (
              <text
                flexShrink={1}
                fg={props.context.theme.text.status.running.default}
                minWidth={0}
                truncate
                wrapMode="none"
              >
                ◐ {agent.agent ?? "subagent"}
                {agent.title ? `: ${agent.title}` : ""}
                {` (${elapsedTime(now() - agent.time.created)})`}
                <Show when={usage(agent)}>{(text) => text()}</Show>
              </text>
            )}
          </For>
        </box>
      </box>
    </Show>
  );
}

function CompactionActivity(props: {
  readonly context: Plugin.Context;
  readonly messages: ToolActivityProps["messages"];
  readonly usage: number | undefined;
}) {
  const compaction = () =>
    props.messages.findLast((message) => message.type === "compaction" && message.status === "running");

  return (
    <>
      <Show when={compaction()}>
        {(value) => (
          <text fg={props.context.theme.text.status.running.default} wrapMode="none">
            ◐ Compacting ({value().reason})
          </text>
        )}
      </Show>
      <Show when={!compaction() && compactionWarning(props.usage)}>
        <text fg={props.context.theme.text.feedback.warning.default} wrapMode="none">
          ! Context {props.usage}% · compaction likely soon
        </text>
      </Show>
    </>
  );
}

function ShellActivity(props: { readonly context: Plugin.Context; readonly messages: ToolActivityProps["messages"] }) {
  const [now, setNow] = createSignal(Date.now());
  const shells = () => props.messages.filter(isRunningShell).slice(-2);

  onMount(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    onCleanup(() => clearInterval(timer));
  });

  return (
    <Show when={shells().length > 0}>
      <box flexDirection="row" flexShrink={1} gap={1} minWidth={0}>
        <text flexShrink={0} fg={props.context.theme.text.subdued} wrapMode="none">
          Shell
        </text>
        <box flexDirection="column" flexShrink={1} minWidth={0}>
          <For each={shells()}>
            {(shell) => (
              <text
                flexShrink={1}
                fg={props.context.theme.text.status.running.default}
                minWidth={0}
                truncate
                wrapMode="none"
              >
                ◐ {shell.command} ({elapsedTime(now() - shell.time.created)})
              </text>
            )}
          </For>
        </box>
      </box>
    </Show>
  );
}

function CodexUsageStatus(props: { readonly context: Plugin.Context; readonly separator: boolean }) {
  const [usage, setUsage] = createSignal<CodexUsage>();

  onMount(() => {
    if (!codexUsageEnabled()) {
      return;
    }

    let active = true;
    let generation = 0;
    let request: AbortController | undefined;
    const refresh = async () => {
      const current = generation + 1;
      generation = current;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), CODEX_USAGE_TIMEOUT_MS);

      try {
        const value = await loadCodexUsage(controller.signal);
        if (active && current === generation) {
          setUsage(value);
        }
      } catch {
        if (active && current === generation) {
          setUsage(undefined);
        }
      } finally {
        clearTimeout(timeout);
      }
    };

    void refresh();
    const interval = setInterval(() => void refresh(), CODEX_USAGE_REFRESH_MS);
    onCleanup(() => {
      active = false;
      request?.abort();
      clearInterval(interval);
    });
  });

  return (
    <Show when={usage()}>
      {(value) => (
        <text flexShrink={1} fg={props.context.theme.text.subdued} minWidth={0} truncate wrapMode="none">
          {props.separator ? "· " : ""}
          {codexUsageText(value())}
        </text>
      )}
    </Show>
  );
}

function Hud(props: HudProps) {
  const session = () => {
    if (!props.sessionID) {
      return undefined;
    }

    return props.context.data.session.get(props.sessionID);
  };

  const messages = () => {
    const current = session();
    if (!current) {
      return [];
    }

    return props.context.data.session.message.list(current.id);
  };
  const selectedModel = () => modelRef(session()?.model, messages());
  const projectPath = () => {
    const location = props.context.location;
    if (!location) {
      return undefined;
    }

    return props.context.ui.format.path(location.directory);
  };
  const branch = () => {
    const location = props.context.location;
    if (!location) {
      return undefined;
    }

    return props.context.data.location.vcs.info(location)?.branch.current;
  };
  const context = createMemo(() => {
    const current = session();
    if (!current) {
      return undefined;
    }

    const models = props.context.data.location.model.list(current.location);
    if (!models) {
      return undefined;
    }

    const input = {
      model: selectedModel(),
      models,
      messages: messages(),
    };

    return { percent: contextPercent(input), text: contextUsage(input) };
  });
  return (
    <box flexDirection="column" flexShrink={1} minWidth={0}>
      <Show when={projectPath()}>
        <box flexDirection="row" flexShrink={1} minWidth={0}>
          <text flexShrink={1} fg={props.context.theme.text.default} minWidth={0} truncate wrapMode="none">
            {projectPath()}
          </text>
          <Show when={props.options.git && branch()}>
            <text fg={props.context.theme.text.subdued}>:</text>
          </Show>
          <Show when={props.options.git}>
            <GitStatus branch={branch()} context={props.context} />
          </Show>
        </box>
      </Show>
      <box flexDirection="row" flexShrink={1} gap={1} minWidth={0}>
        <Show when={props.options.context && context()?.text}>
          {(text) => (
            <text flexShrink={1} fg={props.context.theme.text.subdued} minWidth={0} truncate wrapMode="none">
              {text()}
            </text>
          )}
        </Show>
        <Show when={props.options.codexUsage}>
          <CodexUsageStatus
            context={props.context}
            separator={props.options.context && context()?.text !== undefined}
          />
        </Show>
      </box>
      <Show when={props.options.compaction}>
        <CompactionActivity context={props.context} messages={messages()} usage={context()?.percent} />
      </Show>
      <Show when={props.options.shell}>
        <ShellActivity context={props.context} messages={messages()} />
      </Show>
      <Show when={props.options.tools}>
        <ToolActivity context={props.context} messages={messages()} />
        <ToolFailure context={props.context} messages={messages()} />
      </Show>
      <Show when={props.options.agents && props.sessionID}>
        {(id) => <AgentActivity context={props.context} sessionID={id()} />}
      </Show>
    </box>
  );
}

function toolColor(context: Plugin.Context, status: "completed" | "error" | "running") {
  if (status === "completed") return context.theme.text.feedback.success.default;
  if (status === "error") return context.theme.text.feedback.error.default;
  return context.theme.text.status.running.default;
}

function toolMark(status: "completed" | "error" | "running"): string {
  if (status === "completed") return "✓";
  if (status === "error") return "!";
  return "◐";
}

function isRunningShell(message: SessionMessage): message is ShellMessage {
  return message.type === "shell" && message.status === "running";
}

function vcsInput(context: Plugin.Context): { readonly location: { readonly directory: string } } | undefined {
  const location = context.location;
  if (!location) {
    return undefined;
  }

  return { location: { directory: location.directory } };
}

export default Plugin.define({
  id: "opencode-hud",
  setup(context) {
    const options = hudOptions(context.options);
    return context.ui.slot({
      replace: "prompt.footer.status",
      render: ({ sessionID }) => <Hud context={context} options={options} sessionID={sessionID} />,
    });
  },
});
