import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import type { ClientConfig, DaemonConfig } from "./types";

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
  const existing = readJson<DaemonConfig>(path);
  if (existing) return existing;

  const created: DaemonConfig = {
    host: "127.0.0.1",
    port: 7349,
    token: token(),
    imageName: "sandpilot-codex:latest",
    jobsDir: join(sandpilotDir(), "jobs"),
    codexHome: join(homedir(), ".codex"),
    maxConcurrentJobs: 1,
  };
  writeJson(path, created);
  return created;
}

export function loadClientConfig(): ClientConfig {
  const path = clientConfigPath();
  const daemon = readJson<DaemonConfig>(daemonConfigPath());
  const existing = readJson<ClientConfig>(path);
  if (existing) return existing;

  const created: ClientConfig = {
    baseUrl: "http://127.0.0.1:7349",
    token: daemon?.token ?? token(),
    defaultModel: "gpt-5.4",
  };
  writeJson(path, created);
  return created;
}
