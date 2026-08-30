# Agent Notes

- Read the OpenCode v2 plugin and CLI-plugin documentation before changing API
  usage. Installed runtime types and a live TUI probe override documentation.
- Keep HUD rendering native to `context.ui.slot`; never write status text into
  assistant messages or start sidecar processes.
- Do no blocking work in a slot render callback. Subscribe or poll in component
  lifecycle code, then render reactive state.
- Use only `context.theme` tokens for TUI colors. Keep the default HUD compact;
  it may use multiple non-wrapping lines when that improves readability.
- Derive context usage only from native token fields and the selected model's
  context limit. The 80% compaction warning is a HUD advisory, not an OpenCode
  compaction trigger.
- Show a tool failure only from the current user turn and only within its
  native completion timestamp window. Do not retain failure details outside the
  reactive TUI component.
- Treat `opencode-hud-probe.json` as sensitive session data. It must remain
  ignored and never be added to commits.
- Preserve the milestone boundary: implement, run `pnpm format`, `pnpm typecheck`,
  and `pnpm test`,
  then stop for user review before the next milestone.
