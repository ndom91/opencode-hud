import { Plugin } from "@opencode-ai/plugin/tui"
export default Plugin.define({
  id: "opencode-hud",
  setup(context) {
    return context.ui.slot({
      prepend: "prompt.footer.status",
      render: () => <text fg={context.theme.text.muted}>HUD probe active</text>,
    })
  },
})
