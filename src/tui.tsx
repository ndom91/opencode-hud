import { Plugin } from "@opencode-ai/plugin/tui";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { contextUsage, elapsedTime, gitSummary, modelRef, toolActivity } from "./hud-format.js";

type GitStatusProps = {
  readonly branch?: string;
  readonly context: Plugin.Context;
};

type ToolActivityProps = {
  readonly messages: ReturnType<Plugin.Context["data"]["session"]["message"]["list"]>;
  readonly context: Plugin.Context;
};

type AgentActivityProps = {
  readonly context: Plugin.Context;
  readonly sessionID: string;
};

type HudProps = {
  readonly context: Plugin.Context;
  readonly sessionID?: string;
};

const TOOL_HISTORY_MESSAGE_LIMIT = 32;
const TOOL_HISTORY_PART_LIMIT = 24;

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
        <text fg={props.context.theme.text.subdued}>Tools</text>
        <For each={activities().slice(-4)}>
          {(activity) => (
            <text flexShrink={1} fg={toolColor(props.context, activity.status)} minWidth={0} truncate wrapMode="none">
              {toolMark(activity.status)} {activity.name}
              {activity.count > 1 ? ` ×${activity.count}` : ""}
            </text>
          )}
        </For>
      </box>
    </Show>
  );
}

function recentToolParts(messages: ToolActivityProps["messages"]) {
  const tools = [];
  const firstMessage = Math.max(0, messages.length - TOOL_HISTORY_MESSAGE_LIMIT);

  for (let messageIndex = messages.length - 1; messageIndex >= firstMessage; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (!message || message.type !== "assistant") {
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

function AgentActivity(props: AgentActivityProps) {
  const [now, setNow] = createSignal(Date.now());

  onMount(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);

    onCleanup(() => clearInterval(timer));
  });

  const status = (agent: NonNullable<ReturnType<Plugin.Context["data"]["session"]["get"]>>) => {
    if (props.context.data.session.status(agent.id) === "running") {
      return "running" as const;
    }

    return agent.outcome;
  };
  const agents = () =>
    props.context.data.session
      .family(props.sessionID)
      .map((id) => props.context.data.session.get(id))
      .filter(
        (agent): agent is NonNullable<typeof agent> =>
          agent !== undefined && agent.id !== props.sessionID && agent.parentID !== undefined,
      )
      .filter((agent) => status(agent) !== undefined)
      .sort((left, right) => {
        const leftRunning = status(left) === "running";
        const rightRunning = status(right) === "running";
        if (leftRunning !== rightRunning) {
          return leftRunning ? -1 : 1;
        }

        return right.time.updated - left.time.updated;
      });

  return (
    <Show when={agents().length > 0}>
      <box flexDirection="row" flexShrink={1} gap={1} minWidth={0}>
        <text fg={props.context.theme.text.subdued}>Agents</text>
        <For each={agents().slice(0, 3)}>
          {(agent) => (
            <text flexShrink={1} fg={agentColor(props.context, status(agent))} minWidth={0} truncate wrapMode="none">
              {agentMark(status(agent))} {agent.agent ?? "subagent"}
              {agent.title ? `: ${agent.title}` : ""}
              {` (${elapsedTime((status(agent) === "running" ? now() : agent.time.updated) - agent.time.created)})`}
            </text>
          )}
        </For>
      </box>
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
  const usage = () => {
    const current = session();
    if (!current) {
      return undefined;
    }

    const models = props.context.data.location.model.list(current.location);
    if (!models) {
      return undefined;
    }

    return contextUsage({
      model: selectedModel(),
      models,
      messages: messages(),
    });
  };
  return (
    <box flexDirection="column" flexShrink={1} minWidth={0}>
      <Show when={projectPath()}>
        <box flexDirection="row" flexShrink={1} minWidth={0}>
          <text flexShrink={1} fg={props.context.theme.text.default} minWidth={0} truncate wrapMode="none">
            {projectPath()}
          </text>
          <Show when={branch()}>
            <text fg={props.context.theme.text.subdued}>:</text>
          </Show>
          <GitStatus branch={branch()} context={props.context} />
        </box>
      </Show>
      <Show when={usage()}>
        <text flexShrink={1} fg={props.context.theme.text.subdued} minWidth={0} truncate wrapMode="none">
          {usage()}
        </text>
      </Show>
      <ToolActivity context={props.context} messages={messages()} />
      <Show when={props.sessionID}>{(id) => <AgentActivity context={props.context} sessionID={id()} />}</Show>
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

function agentColor(context: Plugin.Context, status: "running" | "succeeded" | "failed" | "interrupted" | undefined) {
  if (status === "running") return context.theme.text.status.running.default;
  if (status === "succeeded") return context.theme.text.feedback.success.default;
  if (status === "failed") return context.theme.text.feedback.error.default;
  return context.theme.text.feedback.warning.default;
}

function agentMark(status: "running" | "succeeded" | "failed" | "interrupted" | undefined): string {
  if (status === "running") return "◐";
  if (status === "succeeded") return "✓";
  if (status === "failed") return "!";
  return "-";
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
    return context.ui.slot({
      replace: "prompt.footer.status",
      render: ({ sessionID }) => <Hud context={context} sessionID={sessionID} />,
    });
  },
});
