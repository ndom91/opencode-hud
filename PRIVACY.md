# Privacy

All HUD rows other than optional Codex usage use data already available in
OpenCode's local TUI runtime. They do not make network requests or persist
session, tool, shell, agent, Git, or context data. A brief tool-failure row is
derived in memory from the current user turn and expires after 15 seconds.

## Codex Usage Polling

Codex subscription usage is disabled by default. Set `codexUsage` to `true` in
the plugin options in `~/.config/opencode/cli.json` to enable it.

When enabled, the HUD reads the first available OAuth credential from these paths:

1. `$CODEX_HOME/auth.json`, or `~/.codex/auth.json` when `CODEX_HOME` is unset
2. `~/.config/codex/auth.json` when `CODEX_HOME` is unset
3. `$XDG_DATA_HOME/opencode/auth.json`, or `~/.local/share/opencode/auth.json` when `XDG_DATA_HOME` is unset

Only OAuth-shaped entries are accepted. API keys are ignored. If any listed credential file exists but cannot be parsed, the HUD fails closed and does not fall back to another application's file.

The HUD sends the OAuth access token, and the optional account ID, only to the fixed endpoint `https://chatgpt.com/backend-api/wham/usage`. It makes one request when the HUD mounts and then every 30 minutes. Requests are cancelled after 10 seconds.

The HUD never writes, refreshes, copies, logs, or uploads credentials. It does not launch the Codex CLI, read browser cookies, or scrape the ChatGPT website.

This is an undocumented OpenAI backend endpoint. It can change or stop working
without notice. Disable the feature by removing `codexUsage` or setting it to
`false`, then restart OpenCode.
