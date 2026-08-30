# Probe Notes

Milestone 1 was tested against `opencode2 v0.0.0-beta-18387` on 2026-08-29.
The local discovery plugin at `.opencode/plugins/tui/status.tsx` rendered
`HUD probe active` in `prompt.footer.status`, directly beneath the prompt.

The throwaway probe source is retained at `probes/status.tsx`. Its raw local
output is `opencode-hud-probe.json` in the active project directory, which is
intentionally ignored because assistant messages can contain sensitive session
content. The probe requests mode `0600` for newly created output files.

## Findings

1. Context usage can be calculated from native data. An assistant message has
   `tokens.input`, `tokens.output`, `tokens.reasoning`, and
   `tokens.cache.{read,write}`. The selected `ModelInfo.limit.context` provides
   the context-window size. The runtime's own footer uses the message list plus
   the selected model's context limit to calculate a percentage. This needs a
   defined policy for cache tokens and compaction, but does not require a text
   estimate.
2. Compaction has native event markers:
   `session.compaction.started`, `session.compaction.ended`, and
   `session.compaction.failed`. The started/ended events carry the session ID,
   reason (`auto` or `manual`), and recent-message marker.
3. No provider rate-limit window API is exposed by the documented TUI context,
   installed runtime surface, or local OpenCode OpenAPI schema. Optional Codex
   usage polling uses an explicit opt-in and an undocumented provider endpoint.
4. `context.ui.slot(...).render` receives reactive slot props. Reads of
   `context.data` inside a Solid component are reactive as well. The render
   callback itself should remain declarative; event subscriptions and polling
   belong in component lifecycle code and update a signal/store read by JSX.
5. `data.location.vcs.info()` exposes branch information only. v1 uses the
   explicitly approved local OpenCode client request `client.vcs.status()` for
   dirty state, triggered by filesystem and branch events outside render.
6. The host context usage is a hard-wired sibling of the command hint in the
   parent prompt footer. The published slot API cannot suppress it selectively;
   replacing `prompt.footer` would also suppress the host command hint, file
   footer, and other plugin footer contributions.
7. The current plugin/API surface exposes no provider subscriber daily or
   weekly rate-limit windows. The HUD only renders native per-session context
   data, except for the explicit opt-in Codex polling described in PRIVACY.md.
8. Assistant message content includes tool parts with a stable name and
   `streaming`, `running`, `completed`, or `error` state. Session families and
   session status expose active subagents without transcript parsing.
9. The V2 client exposes no Todo or Task resource. `subtask` is only present
   in command configuration and legacy V1 schemas, so the HUD cannot render
   authoritative native task progress.
10. Child sessions retain their own `model`, `location`, and message list.
    Their context usage can therefore be calculated with the same native-token
    policy as the parent session, without querying a provider.
11. Tool parts expose a stable ID, name, state, and `time.{created,completed}`.
    A short tool-failure row can be derived from the newest failed part in the
    current user turn and expire locally from its completion timestamp.
12. OpenCode exposes no compaction threshold. The HUD's 80% warning is a
    conservative advisory based on the native context percentage; it must not
    be described as the point at which OpenCode will compact.

## Observed Runtime Data

`context` keys were `app`, `attention`, `client`, `data`, `keymap`,
`location`, `markdown`, `options`, `renderer`, `storage`, `theme`, `themeMode`,
and `ui`.

The probe observed an assistant message with `type: "assistant"`, model
provider/id/variant, content parts, timestamps, and a `tokens` field when
available. `data.session.cost(id)` returned a number, `data.session.status(id)`
returned `"running"`, and VCS information returned
`{ branch: { current: "main" } }` in this repository.

Event types seen over 30 seconds included `session.execution.started`,
`session.step.started`, `session.reasoning.*`, `session.text.*`,
`session.tool.*`, `session.usage.updated`, `shell.created`, and `shell.exited`.

## Smoke Test

The current HUD was smoke-tested against `opencode2 v0.0.0-beta-18684` on
2026-08-30 in a native tmux TUI session. The local plugin loaded in
`prompt.footer.status`; Git, context, Codex usage, and recent tool activity
rendered correctly.

A shell command with exit code 1 has a native tool state of `completed`, so it
does not show the dedicated failure row. A missing-file `read` has a native
tool state of `error`; the HUD rendered `! read failed` immediately and removed
it after 16 seconds. A running explore subagent rendered its elapsed time and
native context percentage. The test did not exercise the 80% compaction
advisory.

## Beta Risks

- The locally installed `@opencode-ai/plugin` package was
  `0.0.0-beta-17898`, while the CLI runtime was beta-18387. The runtime probe,
  not the npm package, is authoritative for this implementation.
- `SessionMessageInfo` is a discriminated union. Code must check
  `message.type === "assistant"` before reading assistant-only token fields.
- The message list is a synchronized UI data source; its retention/pagination
  behavior must be rechecked before using it for full-session aggregates.
- All event names and slot paths are beta API and require smoke testing after
  every OpenCode upgrade.
