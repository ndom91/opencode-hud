# OpenCode HUD

OpneCode2 plugin to display a persistent status HUD below the text input in the
TUI. It is a native TUI plugin, not an assistant-message renderer, so it does not add HUD
content to a session transcript.

![](./.github/assets/screenshot_004.png)

## 👨‍🏭 Setup

Requires Node.js 24+ and pnpm.

Add the package to the `plugins` array in `~/.config/opencode/cli.json`:

```json
{
  "plugins": [
    "@ndom91/opencode-hud"
  ]
}
```

OpenCode downloads and loads the package. Restart OpenCode after changing the configuration.

To show 5h and weekly usage, we must query the OpenAI API via your system's Codex authorization. This is disabled by default. See [PRIVACY.md](./PRIVACY.md) before enabling it with `OPENCODE_HUD_CODEX_USAGE=1`.

## Configuration

The default HUD shows all available status rows. Disable individual rows with package options:

```json
{
  "plugins": [
    {
      "package": "@ndom91/opencode-hud",
      "options": {
        "agents": false,
        "codexUsage": false,
        "compaction": false,
        "context": true,
        "git": true,
        "shell": true,
        "tools": true
      }
    }
  ]
}
```

OpenCode's `Ctrl+P` -> **Open settings** opens its standard settings editor. Plugin options are JSON configuration, rather than a plugin-specific TUI settings screen.

## 🧑‍💻 Local Development

Requirements:

- `opencode2` v0.0.0-beta-18387 or a compatible newer beta
- Node.js 24+

Install dependencies and validate the TypeScript source:

```sh
pnpm install
pnpm check
pnpm test
```

Start OpenCode from this repository:

```sh
opencode2 .
```

OpenCode discovers `.opencode/plugins/tui/status.tsx` automatically. Start or
open a session to see the HUD under the prompt.

## 🔌 Compatibility

The OpenCode 2 plugin API is beta. Check [NOTES.md](./NOTES.md) and validate
against the installed `@opencode-ai/plugin` runtime types.

## 📝 License

MIT
