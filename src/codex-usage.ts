import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

export type CodexUsage = {
  readonly primaryPercent?: number;
  readonly weeklyPercent?: number;
};

type Credential = {
  readonly accessToken: string;
  readonly accountID?: string;
};

type CredentialFile = {
  readonly credential?: Credential;
  readonly found: boolean;
};

export function codexUsageText(usage: CodexUsage): string | undefined {
  const parts = [];
  if (usage.primaryPercent !== undefined) parts.push(`5h ${usage.primaryPercent}%`);
  if (usage.weeklyPercent !== undefined) parts.push(`Week ${usage.weeklyPercent}%`);

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function parseCodexUsage(value: unknown): CodexUsage | undefined {
  const rateLimit = record(value)?.rate_limit;
  const windows = record(rateLimit);
  if (!windows) {
    return undefined;
  }

  const usage = {
    primaryPercent: usagePercent(windows.primary_window),
    weeklyPercent: usagePercent(windows.secondary_window),
  };

  return usage.primaryPercent === undefined && usage.weeklyPercent === undefined ? undefined : usage;
}

export async function loadCodexUsage(signal: AbortSignal, environment = process.env): Promise<CodexUsage | undefined> {
  const credential = await usageCredential(environment);
  if (!credential) {
    return undefined;
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${credential.accessToken}`,
  };
  if (credential.accountID) {
    headers["ChatGPT-Account-Id"] = credential.accountID;
  }

  const response = await fetch(CODEX_USAGE_URL, { headers, signal });
  if (!response.ok) {
    return undefined;
  }

  return parseCodexUsage(await response.json());
}

async function usageCredential(environment: NodeJS.ProcessEnv): Promise<Credential | undefined> {
  const home = homedir();
  const dataHome = nonEmpty(environment.XDG_DATA_HOME) ?? join(home, ".local", "share");
  const openCode = await credentialFromFile(join(dataHome, "opencode", "auth.json"), parseOpenCodeCredential);
  if (openCode.found) {
    return openCode.credential;
  }

  const codexHome = nonEmpty(environment.CODEX_HOME);
  const native = await credentialFromFile(join(codexHome ?? join(home, ".codex"), "auth.json"), parseCodexCredential);
  if (native.found || codexHome) {
    return native.credential;
  }

  const legacy = await credentialFromFile(join(home, ".config", "codex", "auth.json"), parseCodexCredential);
  if (legacy.found) {
    return legacy.credential;
  }

  return undefined;
}

async function credentialFromFile(
  path: string,
  parse: (value: unknown) => Credential | undefined,
): Promise<CredentialFile> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { found: false };
    }
    throw error;
  }

  try {
    return { credential: parse(JSON.parse(source)), found: true };
  } catch {
    return { found: true };
  }
}

function parseCodexCredential(value: unknown): Credential | undefined {
  const tokens = record(record(value)?.tokens);
  const accessToken = nonEmpty(string(tokens?.access_token) ?? string(tokens?.accessToken));
  if (!accessToken) {
    return undefined;
  }

  return {
    accessToken,
    accountID: nonEmpty(string(tokens?.account_id) ?? string(tokens?.accountId)),
  };
}

function parseOpenCodeCredential(value: unknown): Credential | undefined {
  const auth = record(record(value)?.openai);
  if (auth?.type !== "oauth") {
    return undefined;
  }

  const accessToken = nonEmpty(string(auth.access));
  if (!accessToken) {
    return undefined;
  }

  return { accessToken, accountID: nonEmpty(string(auth.accountId)) };
}

function usagePercent(value: unknown): number | undefined {
  const percent = record(value)?.used_percent;
  return typeof percent === "number" && Number.isFinite(percent) && percent >= 0 && percent <= 100
    ? Math.round(percent)
    : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
