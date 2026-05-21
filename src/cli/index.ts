#!/usr/bin/env bun
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SandpilotDaemon } from "../daemon/server";
import { packageRepo } from "../git/packageRepo";
import { loadClientConfig, loadDaemonConfig } from "../shared/config";
import { apiFetch } from "../shared/http";
import { commandExists, runCommand } from "../shared/shell";
import type { JobEvent, JobRecord, SubmitJobResponse } from "../shared/types";

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

  if (command === "status" && subcommand) return status(subcommand);
  if (command === "logs" && subcommand) return logs(subcommand);
  if (command === "patch" && subcommand) return patch(subcommand);
  if (command === "apply" && subcommand) return apply(subcommand);
  if (command === "cancel" && subcommand) return cancel(subcommand);
  if (command === "list") return list();

  printHelp();
  process.exitCode = 1;
}

async function run(inputArgs: string[]): Promise<void> {
  const options = parseRunArgs(inputArgs);
  const config = loadClientConfig();
  const request = await packageRepo({
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
  console.log(`repo ${response.job.repoName} @ ${response.job.sourceHead.slice(0, 12)}`);

  if (options.stream) {
    await streamJob(response.job.id);
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
  const patchText = await fetchText(`/v1/jobs/${jobId}/patch`);
  const tempDir = mkdtempSync(join(tmpdir(), "sandpilot-apply-"));
  const patchPath = join(tempDir, "result.patch");
  writeFileSync(patchPath, patchText);
  await runCommand(["git", "apply", "--whitespace=nowarn", patchPath], { cwd: process.cwd() });
  console.log(`applied ${jobId}`);
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
    console.log(`${job.id}\t${job.status}\t${job.repoName}\t${job.createdAt}`);
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

async function doctor(): Promise<void> {
  const config = loadDaemonConfig();
  console.log(`config: ${JSON.stringify({ ...config, token: "***" }, null, 2)}`);
  console.log(`git: ${(await commandExists("git")) ? "ok" : "missing"}`);
  console.log(`docker: ${(await commandExists("docker")) ? "ok" : "missing"}`);
  console.log(`codex: ${(await commandExists("codex")) ? "ok" : "missing on host; container image still needs it"}`);
  console.log(`jobs: ${config.jobsDir}`);
  console.log(`codexHome: ${config.codexHome}`);
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

function parseRunArgs(inputArgs: string[]): {
  prompt: string;
  cwd: string;
  stream: boolean;
  model: string | null;
} {
  let cwd = process.cwd();
  let stream = false;
  let model: string | null = null;
  const promptParts: string[] = [];

  for (let index = 0; index < inputArgs.length; index += 1) {
    const value = inputArgs[index];
    if (value === "--cwd" || value === "-C") {
      const next = inputArgs[index + 1];
      if (!next) throw new Error(`${value} requires a directory`);
      cwd = resolve(next);
      index += 1;
    } else if (value === "--model" || value === "-m") {
      const next = inputArgs[index + 1];
      if (!next) throw new Error(`${value} requires a model`);
      model = next;
      index += 1;
    } else if (value === "--stream") {
      stream = true;
    } else if (value) {
      promptParts.push(value);
    }
  }

  const prompt = promptParts.join(" ").trim();
  if (!prompt) throw new Error("run requires a prompt");
  return { prompt, cwd, stream, model };
}

function printHelp(): void {
  console.log(`sandpilot

Usage:
  sandpilot daemon start
  sandpilot daemon doctor
  sandpilot setup agents
  sandpilot doctor agents
  sandpilot run "prompt" [--cwd .] [--model gpt-5.4] [--stream]
  sandpilot status <job-id>
  sandpilot logs <job-id>
  sandpilot patch <job-id>
  sandpilot apply <job-id>
  sandpilot cancel <job-id>
  sandpilot list
`);
}
