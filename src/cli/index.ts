#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SandpilotDaemon } from "../daemon/server";
import { parseRunArgs } from "./runArgs";
import { applyPatchText, createBranchCommitAndPush, defaultResultBranch } from "../git/applyResult";
import { packageRepo } from "../git/packageRepo";
import { loadClientConfig, loadDaemonConfig, saveClientConfig } from "../shared/config";
import { apiFetch } from "../shared/http";
import {
  getAllModels,
  getAllThinkingLevels,
  getDefaultModel,
  getModelProvider,
  getModelThinkingLevels,
  getProviderModels,
  getProviderNames,
  getProviderThinkingLevels,
  MODEL_REGISTRY,
} from "../shared/models";
import { commandExists, runCommand } from "../shared/shell";
import type { JobEvent, JobRecord, SubmitJobRequest, SubmitJobResponse, ThinkingLevel } from "../shared/types";

const args = process.argv.slice(2);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  const [command, subcommand, ...rest] = args;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "daemon" && subcommand === "start") {
    new SandpilotDaemon().start();
    await new Promise(() => undefined);
    return;
  }

  if (command === "daemon" && subcommand === "doctor") {
    await doctor();
    return;
  }

  if (command === "daemon" && subcommand === "sandbox-doctor") {
    await sandboxDoctor();
    return;
  }

  if (command === "setup" && (subcommand === "agents" || subcommand === "skills")) {
    await runProjectScript("scripts/install-local.sh");
    return;
  }

  if (command === "doctor" && (subcommand === "agents" || subcommand === "skills")) {
    await runProjectScript("scripts/agent-doctor.sh");
    return;
  }

  if (command === "run") {
    await run([subcommand, ...rest].filter(Boolean) as string[]);
    return;
  }

  if (command === "models") return models();
  if (command === "watch-apply" && subcommand) return watchApply(subcommand, rest);
  if (command === "watch-branch" && subcommand) return watchBranch(subcommand, rest);
  if (command === "status" && subcommand) return status(subcommand);
  if (command === "logs" && subcommand) return logs(subcommand);
  if (command === "patch" && subcommand) return patch(subcommand);
  if (command === "apply" && subcommand) return apply(subcommand, rest);
  if (command === "branch" && subcommand) return branch(subcommand, rest);
  if (command === "cancel" && subcommand) return cancel(subcommand);
  if (command === "list") return list();
  if (command === "pending") return pending(rest);
  if (command === "start") return start();
  if (command === "setup" && subcommand === "wake-agent") return setupWakeAgent();
  if (command === "setup" && subcommand && !subcommand.startsWith("-")) return setup(subcommand);
  if (command === "set" && subcommand === "model" && rest[0]) return setModel(rest[0]);
  if (command === "set" && subcommand === "runner" && rest[0]) return setRunner(rest[0]);
  if (command === "set" && subcommand === "thinking" && rest[0]) return setThinking(rest[0]);
  if (command === "dashboard") return openDashboard();
  if (command === "update") return update();
  if (command === "tunnel") return tunnel([subcommand, ...rest].filter(Boolean) as string[]);

  printHelp();
  process.exitCode = 1;
}

async function run(inputArgs: string[]): Promise<void> {
  const options = parseRunArgs(inputArgs);
  const config = loadClientConfig();
  const model = options.model ?? config.defaultModel;
  const thinking = options.thinking ?? config.defaultThinking ?? null;
  if (thinking && !getModelThinkingLevels(model).includes(thinking)) {
    throw new Error(`thinking level ${thinking} is not available for ${model}; available: ${getModelThinkingLevels(model).join(", ")}`);
  }
  const request: SubmitJobRequest = options.continueSession
    ? {
        prompt: options.prompt,
        model,
        thinking: thinking ?? undefined,
        deliveryMode: options.branch ? "branch" : "patch",
        ...(options.branchName ? { branchName: options.branchName } : {}),
        sessionMode: "continue",
        sessionId: options.continueSession,
        clientCwd: resolve(options.cwd),
      }
    : {
        ...await packageRepo({
          cwd: options.cwd,
          prompt: options.prompt,
          model,
        }),
        thinking: thinking ?? undefined,
        deliveryMode: options.branch ? "branch" : "patch",
        ...(options.branchName ? { branchName: options.branchName } : {}),
      };

  if (options.branch && !options.continueSession && !request.sourceRemoteUrl) {
    throw new Error("--branch requires an origin remote so the daemon can push the result branch");
  }

  if (request.warning) console.warn(`warning: ${request.warning}`);
  const response = await apiFetch<SubmitJobResponse>(config, "/v1/jobs", {
    method: "POST",
    body: JSON.stringify(request),
  });

  console.log(`submitted ${response.job.id}`);
  if (response.job.sessionId) console.log(`session ${response.job.sessionId}`);
  console.log(`repo ${response.job.repoName} @ ${response.job.sourceHead.slice(0, 12)}`);

  if (options.stream) {
    await streamJob(response.job.id);
  } else if (options.branch) {
    if (options.detach) {
      console.log(`branch push will run on the daemon`);
      console.log(`progress: sandpilot status ${response.job.id}`);
      return;
    }
    const job = await waitForJob(response.job.id);
    console.log(`job ${job.status}`);
    if (job.status !== "succeeded") {
      console.log(`logs: sandpilot logs ${response.job.id}`);
      process.exitCode = 1;
      return;
    }
    const finalJob = (await apiFetch<{ job: JobRecord }>(config, `/v1/jobs/${response.job.id}`)).job;
    if (finalJob.resultBranch) console.log(`pushed branch ${finalJob.resultBranch}`);
  } else if (options.apply) {
    if (options.detach) {
      const logPath = startApplyWatcher(response.job.id, options.cwd);
      console.log(`auto-apply running in background`);
      console.log(`progress: sandpilot status ${response.job.id}`);
      console.log(`logs: ${logPath}`);
      return;
    }
    const job = await waitForJob(response.job.id);
    console.log(`job ${job.status}`);
    if (job.status !== "succeeded") {
      console.log(`logs: sandpilot logs ${response.job.id}`);
      process.exitCode = 1;
      return;
    }
    await applyPatch(response.job.id, options.cwd);
    console.log(`applied ${response.job.id}`);
    console.log("review: git diff");
  }
}

async function streamJob(jobId: string): Promise<void> {
  let after = 0;
  while (true) {
    const config = loadClientConfig();
    const eventsResponse = await apiFetch<{ events: JobEvent[] }>(config, `/v1/jobs/${jobId}/events?after=${after}`);
    for (const event of eventsResponse.events) {
      after = event.seq;
      if (event.type === "stdout" || event.type === "stderr") console.log(event.payload);
      else console.log(`[${event.type}] ${event.payload}`);
    }

    const jobResponse = await apiFetch<{ job: JobRecord }>(config, `/v1/jobs/${jobId}`);
    if (["succeeded", "failed", "cancelled"].includes(jobResponse.job.status)) {
      console.log(`job ${jobResponse.job.status}`);
      if (jobResponse.job.status === "succeeded") {
        console.log(`patch: sandpilot patch ${jobId}`);
        console.log(`apply: sandpilot apply ${jobId}`);
      }
      return;
    }

    await Bun.sleep(1000);
  }
}

async function status(jobId: string): Promise<void> {
  const config = loadClientConfig();
  const { job } = await apiFetch<{ job: JobRecord }>(config, `/v1/jobs/${jobId}`);
  console.log(`${job.id} ${job.status}`);
  if (job.sessionId) console.log(`session: ${job.sessionId}`);
  console.log(`repo: ${job.repoName}`);
  console.log(`branch: ${job.sourceBranch}`);
  console.log(`head: ${job.sourceHead}`);
  console.log(`model: ${job.model}`);
  if (job.resultBranch) console.log(`result branch: ${job.resultBranch}`);
  if (job.resultAppliedAt) console.log(`result applied: ${job.resultAppliedAt}`);
  if (job.resultError) console.log(`result error: ${job.resultError}`);
  if (job.warning) console.log(`warning: ${job.warning}`);
  if (job.exitCode !== null) console.log(`exit: ${job.exitCode}`);
}

async function logs(jobId: string): Promise<void> {
  console.log(await fetchText(`/v1/jobs/${jobId}/logs`));
}

async function patch(jobId: string): Promise<void> {
  console.log(await fetchText(`/v1/jobs/${jobId}/patch`));
}

async function apply(jobId: string, inputArgs: string[]): Promise<void> {
  const { cwd } = parseLocalResultFlags(inputArgs);
  await applyPatch(jobId, cwd);
  await reportJobResult(jobId, { appliedAt: new Date().toISOString(), error: null });
  markApplied(jobId);
  console.log(`applied ${jobId}`);
}

async function branch(jobId: string, inputArgs: string[]): Promise<void> {
  const { cwd, branchName } = parseLocalResultFlags(inputArgs);
  const pushedBranch = await createResultBranch(jobId, cwd, branchName);
  console.log(`pushed branch ${pushedBranch}`);
}

async function watchApply(jobId: string, inputArgs: string[]): Promise<void> {
  const { cwd } = parseLocalResultFlags(inputArgs);
  console.log(`watching ${jobId}`);
  const job = await waitForJob(jobId);
  console.log(`job ${job.status}`);
  if (job.status !== "succeeded") {
    console.log(`logs: sandpilot logs ${jobId}`);
    await notifyMacOS("Sandpilot", `Job ${jobId.slice(0, 16)} failed — run: sandpilot logs ${jobId}`);
    process.exitCode = 1;
    return;
  }
  try {
    await applyPatch(jobId, cwd);
    await reportJobResult(jobId, { appliedAt: new Date().toISOString(), error: null });
    markApplied(jobId);
    console.log(`applied ${jobId}`);
    await notifyMacOS("Sandpilot patch ready", `${job.repoName} - review with: git diff`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await reportJobResult(jobId, { error: message });
    throw error;
  }
}

async function watchBranch(jobId: string, inputArgs: string[]): Promise<void> {
  const { cwd, branchName } = parseLocalResultFlags(inputArgs);
  console.log(`watching ${jobId}`);
  const job = await waitForJob(jobId);
  console.log(`job ${job.status}`);
  if (job.status !== "succeeded") {
    console.log(`logs: sandpilot logs ${jobId}`);
    await notifyMacOS("Sandpilot", `Job ${jobId.slice(0, 16)} failed - run: sandpilot logs ${jobId}`);
    process.exitCode = 1;
    return;
  }
  try {
    const pushedBranch = await createResultBranch(jobId, cwd, branchName, job);
    console.log(`pushed branch ${pushedBranch}`);
    await notifyMacOS("Sandpilot branch ready", `${job.repoName} - ${pushedBranch}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await reportJobResult(jobId, { error: message });
    throw error;
  }
}

async function applyPatch(jobId: string, cwd: string): Promise<void> {
  const patchText = await fetchText(`/v1/jobs/${jobId}/patch`);
  for (const message of await applyPatchText(patchText, cwd)) console.log(message);
}

async function createResultBranch(jobId: string, cwd: string, branchName: string | null, job?: JobRecord): Promise<string> {
  const currentJob = job ?? (await apiFetch<{ job: JobRecord }>(loadClientConfig(), `/v1/jobs/${jobId}`)).job;
  const patchText = await fetchText(`/v1/jobs/${jobId}/patch`);
  const resultBranch = branchName ?? defaultResultBranch(currentJob.repoName, jobId);
  const messages = await createBranchCommitAndPush({
    patchText,
    cwd,
    branchName: resultBranch,
    message: `Sandpilot result ${jobId}`,
  });
  for (const message of messages) console.log(message);
  await reportJobResult(jobId, { branch: resultBranch, appliedAt: new Date().toISOString(), error: null });
  markApplied(jobId);
  return resultBranch;
}

function appliedMarkerPath(jobId: string): string {
  return join(homedir(), ".sandpilot", "applied", `${jobId}.applied`);
}

function markApplied(jobId: string): void {
  const path = appliedMarkerPath(jobId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, new Date().toISOString());
}

function isApplied(jobId: string): boolean {
  return existsSync(appliedMarkerPath(jobId));
}

async function reportJobResult(
  jobId: string,
  result: { branch?: string | null; appliedAt?: string | null; error?: string | null },
): Promise<void> {
  try {
    const config = loadClientConfig();
    await apiFetch(config, `/v1/jobs/${jobId}/result`, {
      method: "POST",
      body: JSON.stringify(result),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`warning: could not update job result: ${message}`);
  }
}

async function notifyMacOS(title: string, message: string): Promise<void> {
  try {
    const proc = Bun.spawn(
      ["osascript", "-e", `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`],
      { stdout: "ignore", stderr: "ignore" },
    );
    await proc.exited;
  } catch {
    // notifications are best-effort; swallow errors silently
  }
}

async function pending(inputArgs: string[]): Promise<void> {
  const shouldApply = inputArgs.includes("--apply");

  const config = loadClientConfig();
  const response = await apiFetch<{ jobs: JobRecord[] }>(config, "/v1/jobs");
  const unapplied = response.jobs.filter(
    (job) => job.status === "succeeded" && !job.resultAppliedAt && !job.resultBranch && !isApplied(job.id),
  );

  if (unapplied.length === 0) {
    console.log("no pending patches");
    return;
  }

  for (const job of unapplied) {
    const cwd = job.clientCwd ?? null;
    console.log(`${job.id}\t${job.repoName}\t${cwd ?? "unknown cwd"}\t${job.finishedAt}`);
    if (shouldApply) {
      if (!cwd) {
        console.log(`skipped ${job.id}: no client cwd recorded (run sandpilot apply ${job.id} --cwd <path>)`);
        continue;
      }
      await applyPatch(job.id, cwd);
      await reportJobResult(job.id, { appliedAt: new Date().toISOString(), error: null });
      markApplied(job.id);
      console.log(`applied ${job.id}`);
    }
  }

  if (!shouldApply) {
    console.log(`\nrun with --apply to apply all pending patches`);
  }
}

async function openDashboard(): Promise<void> {
  const config = loadClientConfig();
  const url = `${config.baseUrl}/?token=${config.token}`;
  console.log(url);
  await runCommand(["open", url]);
}

async function setup(remote: string): Promise<void> {
  const remoteDir = (process.env.SANDPILOT_REMOTE_DIR ?? "~/sandpilot").replace(/^~/, "$HOME");

  console.log("==> Installing local sandpilot wrappers");
  await runProjectScript("scripts/install-local.sh");

  console.log(`\n==> Checking SSH access to ${remote}`);
  await runLive(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", remote, "whoami"]);

  console.log(`\n==> Copying sandpilot to ${remote}:${remoteDir}`);
  await runLive([
    "rsync", "-az", "--delete",
    "--exclude", "node_modules",
    "--exclude", ".sandpilot",
    "--exclude", ".git",
    `${projectRoot}/`, `${remote}:${remoteDir}/`,
  ]);

  console.log("\n==> Installing remote prerequisites and starting daemon");
  const remoteScript = `
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin:$PATH"
cd "${remoteDir}"

if ! command -v bun >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install oven-sh/bun/bun
  else
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
  fi
fi

bun install --silent

if ! command -v claude >/dev/null 2>&1; then
  npm install -g @anthropic-ai/claude-code
fi

if ! command -v codex >/dev/null 2>&1; then
  npm install -g @openai/codex
fi

mkdir -p "$HOME/.sandpilot"
pkill -f "src/cli/index.ts daemon start" >/dev/null 2>&1 || true
nohup bun run src/cli/index.ts daemon start > "$HOME/.sandpilot/daemon.log" 2>&1 &
sleep 2
curl -fsS http://127.0.0.1:7349/health >/dev/null && echo "daemon ok"
`;

  const sshProc = Bun.spawn(["ssh", remote, "/bin/zsh -s"], {
    stdin: new TextEncoder().encode(remoteScript),
    stdout: "inherit",
    stderr: "inherit",
  });
  const sshExit = await sshProc.exited;
  if (sshExit !== 0) throw new Error(`remote setup failed (${sshExit})`);

  console.log("\n==> Syncing daemon token to local client config");
  const { stdout: daemonJson } = await runCommand(["ssh", remote, "cat ~/.sandpilot/daemon.json"]);
  const daemonConfig = JSON.parse(daemonJson) as { port: number; token: string };
  const modelsJson = JSON.parse(readFileSync(join(projectRoot, "src/shared/models.json"), "utf8")) as { defaultProvider: string; providers: Record<string, { defaultModel: string }> };
  const defaultProvider = modelsJson.defaultProvider;
  const defaultModel = modelsJson.providers[defaultProvider]?.defaultModel ?? "claude-sonnet-4-6";
  const clientConfig = {
    baseUrl: `http://127.0.0.1:${daemonConfig.port}`,
    token: daemonConfig.token,
    defaultModel,
    defaultThinking: "medium" as const,
  };
  const clientPath = join(homedir(), ".sandpilot", "client.json");
  mkdirSync(dirname(clientPath), { recursive: true });
  writeFileSync(clientPath, `${JSON.stringify(clientConfig, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(join(homedir(), ".sandpilot", "remote"), `${remote}\n`, { mode: 0o600 });
  console.log("client config written");

  console.log("\n==> Setup complete");
  console.log("\nLog in to Claude Code on the Mac mini:");
  console.log(`  ssh -t ${remote} 'claude auth login'`);
  console.log("\nThen start your session:");
  console.log("  sandpilot start");
}

async function setModel(model: string): Promise<void> {
  const known = getAllModels();
  if (!known.includes(model)) {
    console.error(`unknown model: ${model}`);
    console.error(`available: ${known.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const config = loadClientConfig();
  config.defaultModel = model;
  clearIncompatibleThinking(config, model);
  saveClientConfig(config);
  console.log(`default model set to ${model}`);
}

async function setThinking(level: string): Promise<void> {
  const valid = [...getAllThinkingLevels(), "off"];
  if (!valid.includes(level)) {
    console.error(`unknown thinking level: ${level}`);
    console.error(`available: ${valid.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const config = loadClientConfig();
  if (level !== "off" && !getModelThinkingLevels(config.defaultModel).includes(level)) {
    console.error(`thinking level ${level} is not available for current default model ${config.defaultModel}`);
    console.error(`available for ${config.defaultModel}: ${getModelThinkingLevels(config.defaultModel).join(", ")}`);
    process.exitCode = 1;
    return;
  }
  config.defaultThinking = level === "off" ? undefined : (level as ThinkingLevel);
  saveClientConfig(config);
  console.log(level === "off" ? "thinking disabled by default" : `default thinking set to ${level}`);
}

async function setRunner(runner: string): Promise<void> {
  const RUNNERS: Record<string, string> = {
    claude: getDefaultModel("anthropic"),
    codex: getDefaultModel("openai"),
  };
  const model = RUNNERS[runner];
  if (!model) {
    console.error(`unknown runner: ${runner}`);
    console.error(`available: ${Object.keys(RUNNERS).join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const config = loadClientConfig();
  config.defaultModel = model;
  clearIncompatibleThinking(config, model);
  saveClientConfig(config);
  console.log(`default runner set to ${runner} (model: ${model})`);
  console.log(`change model: sandpilot set model <model>`);
}

function clearIncompatibleThinking(config: ReturnType<typeof loadClientConfig>, model: string): void {
  if (config.defaultThinking && !getModelThinkingLevels(model).includes(config.defaultThinking)) {
    console.log(`clearing default thinking ${config.defaultThinking}; not available for ${model}`);
    config.defaultThinking = undefined;
  }
}

async function setupWakeAgent(): Promise<void> {
  const sandpilotBin = (await runCommand(["which", "sandpilot"])).stdout.trim()
    || join(dirname(fileURLToPath(import.meta.url)), "../../bin/sandpilot");

  const logPath = join(homedir(), ".sandpilot", "wake-agent.log");
  const plistPath = join(homedir(), "Library", "LaunchAgents", "com.sandpilot.wake-agent.plist");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.sandpilot.wake-agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>${sandpilotBin}</string>
    <string>pending</string>
    <string>--apply</string>
  </array>
  <key>StartAfterSystemSleep</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
</dict>
</plist>
`;

  mkdirSync(dirname(plistPath), { recursive: true });
  writeFileSync(plistPath, plist);
  await runCommand(["launchctl", "load", plistPath]);
  console.log(`wake-agent installed: ${plistPath}`);
  console.log(`logs: ${logPath}`);
  console.log(`sandpilot pending --apply will run automatically on every wake from sleep`);
}

function startApplyWatcher(jobId: string, cwd: string): string {
  const logDir = join(homedir(), ".sandpilot", "apply");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `${jobId}.log`);
  const proc = Bun.spawn(
    ["bun", "run", fileURLToPath(import.meta.url), "watch-apply", jobId, "--cwd", cwd],
    {
      cwd,
      stdin: "ignore",
      stdout: Bun.file(logPath),
      stderr: Bun.file(logPath),
      detached: true,
    },
  );
  proc.unref();
  return logPath;
}

function parseLocalResultFlags(inputArgs: string[]): { cwd: string; branchName: string | null } {
  let cwd = process.cwd();
  let branchName: string | null = null;
  for (let index = 0; index < inputArgs.length; index += 1) {
    const value = inputArgs[index];
    if (value === "--cwd" || value === "-C") {
      const next = inputArgs[index + 1];
      if (!next) throw new Error(`${value} requires a directory`);
      cwd = resolve(next);
      index += 1;
    } else if (value === "--branch-name") {
      const next = inputArgs[index + 1];
      if (!next) throw new Error(`${value} requires a branch name`);
      branchName = next;
      index += 1;
    }
  }
  return { cwd, branchName };
}

async function cancel(jobId: string): Promise<void> {
  const config = loadClientConfig();
  await apiFetch(config, `/v1/jobs/${jobId}/cancel`, { method: "POST", body: "{}" });
  console.log(`cancelled ${jobId}`);
}

async function list(): Promise<void> {
  const config = loadClientConfig();
  const response = await apiFetch<{ jobs: JobRecord[] }>(config, "/v1/jobs");
  if (response.jobs.length === 0) {
    console.log("no jobs found");
    return;
  }
  const col = (s: string, w: number) => s.padEnd(w).slice(0, w);
  console.log(`${"ID".padEnd(36)}  ${"STATUS".padEnd(12)}  ${"REPO".padEnd(24)}  CREATED`);
  console.log("-".repeat(90));
  for (const job of response.jobs) {
    const created = new Date(job.createdAt).toLocaleString();
    console.log(`${col(job.id, 36)}  ${col(job.status, 12)}  ${col(job.repoName ?? "-", 24)}  ${created}`);
  }
}

async function models(): Promise<void> {
  const config = loadClientConfig();
  console.log(`default model: ${config.defaultModel}`);
  console.log(`default thinking: ${config.defaultThinking ?? "off"}`);
  console.log("");

  for (const provider of getProviderNames()) {
    const providerConfig = MODEL_REGISTRY.providers[provider];
    if (!providerConfig) continue;
    const runner = provider === "anthropic" ? "claude" : provider === "openai" ? "codex" : provider;
    console.log(`${runner} (${provider})`);
    console.log(`  default: ${providerConfig.defaultModel}`);
    console.log(`  thinking: ${getProviderThinkingLevels(provider).join(", ")}`);
    console.log(`  models:`);
    for (const model of getProviderModels(provider)) {
      const markers = [
        model === providerConfig.defaultModel ? "provider default" : null,
        model === config.defaultModel ? "current default" : null,
      ].filter(Boolean);
      console.log(`    ${model}${markers.length ? ` (${markers.join(", ")})` : ""}`);
    }
    console.log("");
  }
}

async function fetchText(path: string): Promise<string> {
  const config = loadClientConfig();
  const response = await fetch(`${config.baseUrl}${path}`, {
    headers: { authorization: `Bearer ${config.token}` },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.text();
}

async function waitForJob(jobId: string): Promise<JobRecord> {
  const config = loadClientConfig();
  while (true) {
    const { job } = await apiFetch<{ job: JobRecord }>(config, `/v1/jobs/${jobId}`);
    if (["succeeded", "failed", "cancelled"].includes(job.status)) {
      return job;
    }
    await Bun.sleep(2000);
  }
}

async function doctor(): Promise<void> {
  const config = loadDaemonConfig();
  console.log(`config: ${JSON.stringify({ ...config, token: "***" }, null, 2)}`);
  console.log(`git: ${(await commandExists("git")) ? "ok" : "missing"}`);
  console.log(`docker: ${(await commandExists("docker")) ? "ok" : "missing"}`);
  console.log(`claude: ${(await commandExists("claude")) ? "ok" : "missing on host; container image still needs it"}`);
  console.log(`codex: ${(await commandExists("codex")) ? "ok (fallback)" : "missing on host; container image still needs it"}`);
  console.log(`jobs: ${config.jobsDir}`);
  console.log(`claudeHome: ${config.claudeHome}`);
  console.log(`codexHome: ${config.codexHome}`);
  console.log(`codexFallbackModel: ${config.codexFallbackModel}`);
}

async function sandboxDoctor(): Promise<void> {
  const config = loadDaemonConfig();
  const proc = Bun.spawn(
    [
      "docker",
      "run",
      "--rm",
      config.imageName,
      "bash",
      "/opt/sandpilot/sandbox-doctor.sh",
    ],
    {
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Sandbox doctor failed with exit code ${exitCode}`);
  }
}

async function runProjectScript(relativePath: string): Promise<void> {
  const scriptPath = join(projectRoot, relativePath);
  const proc = Bun.spawn([scriptPath], {
    cwd: projectRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`${relativePath} failed with exit code ${exitCode}`);
  }
}

async function start(): Promise<void> {
  const config = loadClientConfig();

  // 1. tunnel
  const tunnelRunning = await isTunnelRunning(config);
  if (tunnelRunning) {
    console.log("✓ tunnel already running");
  } else {
    console.log("starting tunnel...");
    const tunnelBin = join(projectRoot, "bin", "sandpilot-tunnel");
    const proc = Bun.spawn([tunnelBin, "--detach"], { stdout: "inherit", stderr: "inherit" });
    await proc.exited;
    await Bun.sleep(1500);
  }

  // 2. daemon health — restart via SSH if down
  const healthy = await isDaemonHealthy(config);
  if (healthy) {
    console.log("✓ daemon healthy");
  } else {
    const remotePath = join(homedir(), ".sandpilot", "remote");
    if (!existsSync(remotePath)) {
      throw new Error("daemon unreachable and no remote configured — run: bun run src/cli/index.ts setup <user@host>");
    }
    const remote = readFileSync(remotePath, "utf8").trim();
    const remoteDir = (process.env.SANDPILOT_REMOTE_DIR ?? "~/sandpilot").replace(/^~/, "$HOME");
    console.log("daemon unreachable — restarting on Mac mini...");
    await runLive([
      "ssh", remote,
      [
        'export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin:$PATH"',
        `cd "${remoteDir}"`,
        'pkill -f "src/cli/index.ts daemon start" || true',
        `nohup bun run src/cli/index.ts daemon start > ~/.sandpilot/daemon.log 2>&1 &`,
        "sleep 2",
        "curl -fsS http://127.0.0.1:7349/health > /dev/null && echo 'daemon ok'",
      ].join("\n"),
    ]);
  }

  // 3. pending patches
  console.log("checking for pending patches...");
  await pending(["--apply"]);

  // 4. summary
  console.log("\nready — run: sandpilot run \"your task\" --cwd . --apply --detach");
}

async function isTunnelRunning(config: ReturnType<typeof loadClientConfig>): Promise<boolean> {
  return isDaemonHealthy(config);
}

async function isDaemonHealthy(config: ReturnType<typeof loadClientConfig>): Promise<boolean> {
  try {
    const r = await fetch(`${config.baseUrl}/health`);
    return r.ok;
  } catch {
    return false;
  }
}

async function tunnel(inputArgs: string[]): Promise<void> {
  const tunnelBin = join(projectRoot, "bin", "sandpilot-tunnel");
  const stop = inputArgs.includes("--stop");
  const detach = inputArgs.includes("--detach");
  const args = [tunnelBin];
  if (stop) args.push("--stop");
  else if (detach) args.push("--detach");
  await runLive(args);
}

async function update(): Promise<void> {
  const remotePath = join(homedir(), ".sandpilot", "remote");
  if (!existsSync(remotePath)) {
    throw new Error("no remote configured — run: bun run src/cli/index.ts setup <user@host>");
  }
  const remote = readFileSync(remotePath, "utf8").trim();
  // rsyncDir uses ~ which the remote shell expands; remoteDir uses $HOME for inline SSH scripts
  const rsyncDir = process.env.SANDPILOT_REMOTE_DIR ?? "~/sandpilot";
  const remoteDir = rsyncDir.replace(/^~/, "$HOME");

  console.log(`remote: ${remote}`);

  console.log("\npulling latest...");
  await runLive(["git", "pull"], { cwd: projectRoot });

  console.log(`\nsyncing to ${remote}...`);
  await runLive([
    "rsync", "-az", "--delete",
    "--exclude", "node_modules",
    "--exclude", ".sandpilot",
    "--exclude", ".git",
    `${projectRoot}/`, `${remote}:${rsyncDir}/`,
  ]);

  console.log("\nrestarting daemon...");
  await runLive([
    "ssh", remote,
    [
      'export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin:$PATH"',
      `cd "${remoteDir}"`,
      "bun install --silent",
      'pkill -f "src/cli/index.ts daemon start" || true',
      `nohup bun run src/cli/index.ts daemon start > ~/.sandpilot/daemon.log 2>&1 &`,
      "sleep 1",
      "curl -fsS http://127.0.0.1:7349/health > /dev/null && echo 'daemon ok'",
    ].join("\n"),
  ]);

  console.log("\nupdating local integrations...");
  await runProjectScript("scripts/install-local.sh");

  console.log("\ndone — sandpilot updated");
}

async function runLive(command: string[], options: { cwd?: string } = {}): Promise<void> {
  const proc = Bun.spawn(command, {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) throw new Error(`command failed (${exitCode}): ${command[0]}`);
}

function printHelp(): void {
  const defaultModel = getDefaultModel();
  console.log(`sandpilot

Usage:
  sandpilot daemon start
  sandpilot daemon doctor
  sandpilot daemon sandbox-doctor
  sandpilot setup <user@mac-mini.local>
  sandpilot setup agents
  sandpilot setup skills
  sandpilot doctor agents
  sandpilot doctor skills
  sandpilot models
  sandpilot run "prompt" [--cwd .] [--model ${defaultModel}] [--stream] [--apply|--branch] [--detach] [--branch-name name] [--new-session]
  sandpilot run "prompt" --continue <session-id> [--model ${defaultModel}] [--stream] [--apply|--branch] [--detach] [--branch-name name]
  sandpilot status <job-id>
  sandpilot logs <job-id>
  sandpilot patch <job-id>
  sandpilot apply <job-id> [--cwd .]
  sandpilot branch <job-id> [--cwd .] [--branch-name name]
  sandpilot cancel <job-id>
  sandpilot list
  sandpilot tunnel [--detach] [--stop]
  sandpilot start
  sandpilot pending [--apply]
  sandpilot dashboard
  sandpilot update
  sandpilot set runner <claude|codex>
  sandpilot set model <model>
  sandpilot set thinking <level|off>
  sandpilot setup wake-agent
`);
}
