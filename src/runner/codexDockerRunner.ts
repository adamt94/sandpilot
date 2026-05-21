import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DaemonConfig, RunnerInput } from "../shared/types";
import { commandExists, runCommand } from "../shared/shell";
import type { JobStore } from "../daemon/store";

export async function prepareRepo(input: RunnerInput, store: JobStore): Promise<string> {
  mkdirSync(input.jobDir, { recursive: true });

  await runCommand(["git", "clone", input.bundlePath, input.repoDir]);
  await runCommand(["git", "checkout", input.job.sourceHead], { cwd: input.repoDir });

  const diff = await Bun.file(input.diffPath).text();
  if (diff.trim()) {
    await runCommand(["git", "apply", "--whitespace=nowarn", input.diffPath], { cwd: input.repoDir });
  }

  await runCommand(["git", "config", "user.name", "Sandpilot"], { cwd: input.repoDir });
  await runCommand(["git", "config", "user.email", "sandpilot@localhost"], { cwd: input.repoDir });

  const status = (await runCommand(["git", "status", "--porcelain"], { cwd: input.repoDir })).stdout.trim();
  if (status) {
    await runCommand(["git", "add", "-A"], { cwd: input.repoDir });
    await runCommand(["git", "commit", "-m", "sandpilot baseline"], { cwd: input.repoDir });
  }

  const baseline = (await runCommand(["git", "rev-parse", "HEAD"], { cwd: input.repoDir })).stdout.trim();
  store.addEvent(input.job.id, "info", `Baseline ready: ${baseline}`);
  return baseline;
}

export async function runCodexInDocker(input: {
  runner: RunnerInput;
  config: DaemonConfig;
  store: JobStore;
  signal: AbortSignal;
}): Promise<number> {
  if (!(await commandExists("docker"))) {
    throw new Error("Docker is not available on PATH on the daemon host");
  }

  if (!existsSync(input.config.codexHome)) {
    throw new Error(`Codex home does not exist on daemon host: ${input.config.codexHome}`);
  }

  const logPath = join(input.runner.jobDir, "codex.jsonl");
  const logFile = Bun.file(logPath);
  const writer = logFile.writer();

  const args = [
    "docker",
    "run",
    "--rm",
    "-v",
    `${input.runner.repoDir}:/workspace`,
    "-v",
    `${input.config.codexHome}:/home/node/.codex`,
    "-w",
    "/workspace",
    "-e",
    "CODEX_HOME=/home/node/.codex",
    input.config.imageName,
    "codex",
    "exec",
    "--json",
    "--dangerously-bypass-approvals-and-sandbox",
    "--skip-git-repo-check",
    "-C",
    "/workspace",
    "-m",
    input.runner.job.model,
    input.runner.job.prompt,
  ];

  input.store.addEvent(input.runner.job.id, "info", `Starting Docker: ${input.config.imageName}`);
  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const abort = () => {
    proc.kill();
  };
  input.signal.addEventListener("abort", abort, { once: true });

  await Promise.all([
    streamToStore(proc.stdout, writer, input.store, input.runner.job.id, "stdout"),
    streamToStore(proc.stderr, writer, input.store, input.runner.job.id, "stderr"),
  ]);

  const exitCode = await proc.exited;
  input.signal.removeEventListener("abort", abort);
  writer.end();
  input.store.upsertArtifact(input.runner.job.id, "log", logPath);

  return exitCode;
}

export async function writePatchAndSummary(input: {
  runner: RunnerInput;
  store: JobStore;
  baseline: string;
  exitCode: number;
}): Promise<void> {
  const patchPath = join(input.runner.jobDir, "result.patch");
  const summaryPath = join(input.runner.jobDir, "summary.md");
  await runCommand(["git", "add", "--intent-to-add", "."], { cwd: input.runner.repoDir });
  const patch = (
    await runCommand(["git", "diff", "--binary", input.baseline], { cwd: input.runner.repoDir })
  ).stdout;
  writeFileSync(patchPath, patch);

  writeFileSync(
    summaryPath,
    [
      `# Sandpilot Job ${input.runner.job.id}`,
      "",
      `- Repo: ${input.runner.job.repoName}`,
      `- Branch: ${input.runner.job.sourceBranch}`,
      `- Source HEAD: ${input.runner.job.sourceHead}`,
      `- Model: ${input.runner.job.model}`,
      `- Exit code: ${input.exitCode}`,
      `- Patch bytes: ${Buffer.byteLength(patch)}`,
      "",
      "## Prompt",
      "",
      input.runner.job.prompt,
      "",
    ].join("\n"),
  );

  input.store.upsertArtifact(input.runner.job.id, "patch", patchPath);
  input.store.upsertArtifact(input.runner.job.id, "summary", summaryPath);
}

async function streamToStore(
  stream: ReadableStream<Uint8Array>,
  writer: Bun.FileSink,
  store: JobStore,
  jobId: string,
  type: "stdout" | "stderr",
): Promise<void> {
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    const text = decoder.decode(chunk);
    writer.write(text);
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) store.addEvent(jobId, type, line);
    }
  }
}
