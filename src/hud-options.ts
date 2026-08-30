export type HudOptions = {
  readonly agents: boolean;
  readonly codexUsage: boolean;
  readonly compaction: boolean;
  readonly context: boolean;
  readonly git: boolean;
  readonly shell: boolean;
  readonly tools: boolean;
};

const DEFAULT_OPTIONS: HudOptions = {
  agents: true,
  codexUsage: false,
  compaction: true,
  context: true,
  git: true,
  shell: true,
  tools: true,
};

// hudOptions accepts explicit booleans so unknown or invalid options preserve the default HUD.
export function hudOptions(options: Readonly<Record<string, unknown>>): HudOptions {
  return {
    agents: enabled(options, "agents"),
    codexUsage: enabled(options, "codexUsage"),
    compaction: enabled(options, "compaction"),
    context: enabled(options, "context"),
    git: enabled(options, "git"),
    shell: enabled(options, "shell"),
    tools: enabled(options, "tools"),
  };
}

function enabled(options: Readonly<Record<string, unknown>>, name: keyof HudOptions): boolean {
  return typeof options[name] === "boolean" ? options[name] : DEFAULT_OPTIONS[name];
}
