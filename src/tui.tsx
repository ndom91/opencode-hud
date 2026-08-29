import { Plugin } from "@opencode-ai/plugin/tui"
import { createSignal, onCleanup, onMount, Show } from "solid-js"

import { contextUsage, modelRef } from "./hud-format.js"

type GitStateProps = {
  readonly context: Plugin.Context
}

type HudProps = {
  readonly context: Plugin.Context
  readonly sessionID?: string
}

function GitState(props: GitStateProps) {
  const [dirty, setDirty] = createSignal(false)

  onMount(() => {
    let active = true
    let generation = 0

    const refresh = async () => {
      const request = generation + 1
      generation = request
      const input = vcsInput(props.context)

      try {
        const status = await props.context.client.vcs.status(input)
        if (active && request === generation) {
          setDirty(status.data.length > 0)
        }
      } catch (error) {
        if (active && request === generation) {
          setDirty(false)
        }
        console.error("OpenCode HUD VCS status failed", error)
      }
    }

    const refreshStatus = () => {
      void refresh()
    }

    refreshStatus()
    const stopFilesystem = props.context.data.on("filesystem.changed", refreshStatus)
    const stopVcs = props.context.data.on("vcs.branch.updated", refreshStatus)

    onCleanup(() => {
      active = false
      stopFilesystem()
      stopVcs()
    })
  })

  return <Show when={dirty()}><span> *</span></Show>
}

function Hud(props: HudProps) {
  const session = () => {
    if (!props.sessionID) {
      return undefined
    }

    return props.context.data.session.get(props.sessionID)
  }

  const messages = () => {
    const current = session()
    if (!current) {
      return []
    }

    return props.context.data.session.message.list(current.id)
  }
  const selectedModel = () => modelRef(session()?.model, messages())
  const project = () => {
    const location = props.context.location
    if (!location) {
      return undefined
    }

    const path = props.context.ui.format.path(location.directory)
    const branch = props.context.data.location.vcs.info(location)?.branch.current
    if (!branch) {
      return path
    }

    return `${path}:${branch}`
  }
  const usage = () => {
    const current = session()
    if (!current) {
      return undefined
    }

    const models = props.context.data.location.model.list(current.location)
    if (!models) {
      return undefined
    }

    return contextUsage({
      model: selectedModel(),
      models,
      messages: messages(),
    })
  }
  return (
    <box flexDirection="column" flexShrink={1} minWidth={0}>
      <Show when={project()}>
        <text flexShrink={1} fg={props.context.theme.text.default} minWidth={0} truncate wrapMode="none">{project()}<GitState context={props.context} /></text>
      </Show>
      <Show when={usage()}>
        <text flexShrink={1} fg={props.context.theme.text.subdued} minWidth={0} truncate wrapMode="none">{usage()}</text>
      </Show>
    </box>
  )
}

function vcsInput(context: Plugin.Context): { readonly location: { readonly directory: string } } | undefined {
  const location = context.location
  if (!location) {
    return undefined
  }

  return { location: { directory: location.directory } }
}

export default Plugin.define({
  id: "opencode-hud",
  setup(context) {
    return context.ui.slot({
      replace: "prompt.footer.status",
      render: ({ sessionID }) => <Hud context={context} sessionID={sessionID} />,
    })
  },
})
