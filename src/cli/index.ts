#!/usr/bin/env bun
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SandpilotDaemon } from "../daemon/server";
import { parseRunArgs } from "./runArgs";
import { packageRepo } from "../git/packageRepo";
import { loadClientConfig, loadDaemonConfig } from "../shared/config";
import { apiFetch } from "../shared/http";
import { getDefaultModel } from "../shared/models";
import { commandExists, runCommand } from "../shared/shell";
import type { JobEvent, JobRecord, SubmitJobRequest, SubmitJobResponse } from "../shared/types";

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

  if (command === "setup" && subcommand === "agents") {
    await runProjectScript("scripts/install-local.sh");
    return;
  }

  if (command === "doctor" && subcommand === "agents") {
    await runProjectScript("scripts/agent-doctor.sh");
    return;
  }

  if (command === "run") {
    await run([subcommand, ...rest].filter(Boolean) as string[]);
    return;
  }

  if (command === "watch-apply" && subcommand) return watchApply(subcommand, rest);
  if (command === "status" && subcommand) return status(subcommand);
  if (command === "logs" && subcommand) return logs(subcommand);
  if (command === "patch" && subcommand) return patch(subcommand);
  if (command === "apply" && subcommand) return apply(subcommand);
  if (command === "cancel" && subcommand) return cancel(subcommand);
  if (command === "list") return list();
  if (command === "pending") return pending(rest);
  if (command === "setup" && subcommand === "wake-agent") return setupWakeAgent();
  if (command === "dashboard") return openDashboard();
  if (command === "update") return update();

  printHelp();
  process.exitCode = 1;
}

async function run(inputArgs: string[]): Promise<void> {
  const options = parseRunArgs(inputArgs);
  const config = loadClientConfig();
  const request: SubmitJobRequest = options.continueSession
    ? {
        prompt: options.prompt,
        model: options.model ?? config.defaultModel,
        sessionMode: "continue",
        sessionId: options.continueSession,
        clientCwd: resolve(options.cwd),
      }
    : await packageRepo({
        cwd: options.cwd,
        prompt: options.prompt,
        model: options.model ?? config.defaultModel,
      });

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
  if (job.warning) console.log(`warning: ${job.warning}`);
  if (job.exitCode !== null) console.log(`exit: ${job.exitCode}`);
}

async function logs(jobId: string): Promise<void> {
  console.log(await fetchText(`/v1/jobs/${jobId}/logs`));
}

async function patch(jobId: string): Promise<void> {
  console.log(await fetchText(`/v1/jobs/${jobId}/patch`));
}

async function apply(jobId: string): Promise<void> {
  await applyPatch(jobId, process.cwd());
  markApplied(jobId);
  console.log(`applied ${jobId}`);
}

async function watchApply(jobId: string, inputArgs: string[]): Promise<void> {
  const cwd = parseCwdFlag(inputArgs);
  console.log(`watching ${jobId}`);
  const job = await waitForJob(jobId);
  console.log(`job ${job.status}`);
  if (job.status !== "succeeded") {
    console.log(`logs: sandpilot logs ${jobId}`);
    await notifyMacOS("Sandpilot", `Job ${jobId.slice(0, 16)} failed — run: sandpilot logs ${jobId}`);
    process.exitCode = 1;
    return;
  }
  await applyPatch(jobId, cwd);
  markApplied(jobId);
  console.log(`applied ${jobId}`);
  await notifyMacOS("Sandpilot patch ready", `${job.repoName} — review with: git diff`);
}

async function applyPatch(jobId: string, cwd: string): Promise<void> {
  const patchText = await fetchText(`/v1/jobs/${jobId}/patch`);
  if (!patchText.trim()) {
    console.log(`no patch to apply for ${jobId}`);
    return;
  }
  const tempDir = mkdtempSync(join(tmpdir(), "sandpilot-apply-"));
  const patchPath = join(tempDir, "result.patch");
  writeFileSync(patchPath, patchText);
  await runCommand(["git", "apply", "--whitespace=nowarn", patchPath], { cwd });
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
    (job) => job.status === "succeeded" && !isApplied(job.id),
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

function parseCwdFlag(inputArgs: string[]): string {
  let cwd = process.cwd();
  for (let index = 0; index < inputArgs.length; index += 1) {
    const value = inputArgs[index];
    if (value === "--cwd" || value === "-C") {
      const next = inputArgs[index + 1];
      if (!next) throw new Error(`${value} requires a directory`);
      cwd = resolve(next);
      index += 1;
    }
  }
  return cwd;
}

async function cancel(jobId: string): Promise<void> {
  const config = loadClientConfig();
  await apiFetch(config, `/v1/jobs/${jobId}/cancel`, { method: "POST", body: "{}" });
  console.log(`cancelled ${jobId}`);
}

async function list(): Promise<void> {
  const config = loadClientConfig();
  const response = await apiFetch<{ jobs: JobRecord[] }>(config, "/v1/jobs");
  for (const job of response.jobs) {
    console.log(`${job.id}\t${job.sessionId ?? "-"}\t${job.status}\t${job.repoName}\t${job.createdAt}`);
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

async function update(): Promise<void> {
  const remotePath = join(homedir(), ".sandpilot", "remote");
  if (!existsSync(remotePath)) {
    throw new Error("no remote configured — run scripts/bootstrap.sh <user@host> first");
  }
  const remote = readFileSync(remotePath, "utf8").trim();
  const remoteDir = process.env.SANDPILOT_REMOTE_DIR ?? "~/sandpilot";

  console.log(`remote: ${remote}`);

  console.log("\npulling latest...");
  await runLive(["git", "pull"], { cwd: projectRoot });

  console.log(`\nsyncing to ${remote}...`);
  await runLive([
    "rsync", "-az", "--delete",
    "--exclude", "node_modules",
    "--exclude", ".sandpilot",
    "--exclude", ".git",
    `${projectRoot}/`, `${remote}:${remoteDir}/`,
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
    ].join(" && "),
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
  sandpilot setup agents
  sandpilot doctor agents
  sandpilot run "prompt" [--cwd .] [--model ${defaultModel}] [--stream] [--apply] [--detach] [--new-session]
  sandpilot run "prompt" --continue <session-id> [--model ${defaultModel}] [--stream] [--apply] [--detach]
  sandpilot status <job-id>
  sandpilot logs <job-id>
  sandpilot patch <job-id>
  sandpilot apply <job-id>
  sandpilot cancel <job-id>
  sandpilot list
  sandpilot pending [--apply]
  sandpilot dashboard
  sandpilot update
  sandpilot setup wake-agent
`);
}
