import { Plugin } from "@opencode-ai/plugin/tui";
import { onMount } from "solid-js";
import { writeFile } from "node:fs/promises";

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function Probe(props: { context: Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0]; sessionID?: string }) {
  onMount(() => {
    if (!props.sessionID) return;

    const probePath = `${props.context.location?.directory ?? process.cwd()}/opencode-hud-probe.json`;

    const eventTypes = new Set<string>();
    const stop = props.context.data.listen((event) => {
      eventTypes.add(event.details.type);
    });

    setTimeout(() => {
      stop();
      const messages = props.context.data.session.message.list(props.sessionID!);
      const assistant = messages.findLast((message) => message.type === "assistant");
      void writeFile(
        probePath,
        json({
          contextKeys: Object.keys(props.context).sort(),
          assistantMessage: assistant,
          cost: props.context.data.session.cost(props.sessionID!),
          status: props.context.data.session.status(props.sessionID!),
          vcs: props.context.data.location.vcs.info(props.context.location),
          eventTypes: [...eventTypes].sort(),
        }),
        { mode: 0o600 },
      ).catch((error: unknown) => console.error("OpenCode HUD probe write failed", error));
    }, 30_000);
  });

  return <text fg={props.context.theme.text.muted}>HUD probe active</text>;
}

export default Plugin.define({
  id: "opencode-hud.probe",
  setup(context) {
    return context.ui.slot({
      prepend: "prompt.footer.status",
      render: ({ sessionID }) => <Probe context={context} sessionID={sessionID} />,
    });
  },
});
