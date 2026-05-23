import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import type { ClientConfig, DaemonConfig } from "./types";
import { getAllModels, getDefaultModel } from "./models";

const appDir = join(homedir(), ".sandpilot");

function token(): string {
  return randomBytes(32).toString("hex");
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

export function sandpilotDir(): string {
  mkdirSync(appDir, { recursive: true });
  return appDir;
}

export function daemonConfigPath(): string {
  return join(sandpilotDir(), "daemon.json");
}

export function clientConfigPath(): string {
  return join(sandpilotDir(), "client.json");
}

export function loadDaemonConfig(): DaemonConfig {
  const path = daemonConfigPath();
  const existing = readJson<Partial<DaemonConfig>>(path);

  const defaults: DaemonConfig = {
    host: "127.0.0.1",
    port: 7349,
    token: token(),
    imageName: "sandpilot-codex:latest",
    claudeImageName: "sandpilot-claude:latest",
    jobsDir: join(sandpilotDir(), "jobs"),
    codexHome: join(homedir(), ".codex"),
    claudeHome: join(homedir(), ".claude"),
    codexFallbackModel: getDefaultModel("openai"),
    maxConcurrentJobs: 1,
  };

  if (!existing) {
    writeJson(path, defaults);
    return defaults;
  }

  // fill in any fields added after initial setup
  const merged: DaemonConfig = { ...defaults, ...existing };
  if (JSON.stringify(merged) !== JSON.stringify(existing)) {
    writeJson(path, merged);
  }
  return merged;
}

export function loadClientConfig(): ClientConfig {
  const path = clientConfigPath();
  const daemon = readJson<DaemonConfig>(daemonConfigPath());
  const existing = readJson<ClientConfig>(path);

  if (!existing) {
    const created = createDefaultClientConfig(daemon);
    writeJson(path, created);
    return created;
  }

  // migrate: if the stored model is no longer in the known list, reset to current default
  const knownModels = getAllModels();
  const migratedModel = knownModels.includes(existing.defaultModel)
    ? existing.defaultModel
    : getDefaultModel();

  // fill in any fields added after initial setup (e.g. defaultThinking)
  const defaults = createDefaultClientConfig(daemon);
  const merged: ClientConfig = { ...defaults, ...existing, defaultModel: migratedModel };

  if (JSON.stringify(merged) !== JSON.stringify(existing)) {
    writeJson(path, merged);
  }
  return merged;
}

export function createDefaultClientConfig(daemon: DaemonConfig | null = null): ClientConfig {
  return {
    baseUrl: "http://127.0.0.1:7349",
    token: daemon?.token ?? token(),
    defaultModel: getDefaultModel(),
    defaultThinking: "medium",
  };
}

export function saveClientConfig(config: ClientConfig): void {
  writeJson(clientConfigPath(), config);
}
