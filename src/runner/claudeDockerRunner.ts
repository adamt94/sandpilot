import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DaemonConfig, RunnerInput } from "../shared/types";
import { commandExists } from "../shared/shell";
import type { JobStore } from "../daemon/store";

export async function runClaudeInDocker(input: {
  runner: RunnerInput;
  config: DaemonConfig;
  store: JobStore;
  signal: AbortSignal;
}): Promise<number> {
  if (!(await commandExists("docker"))) {
    throw new Error("Docker is not available on PATH on the daemon host");
  }

  if (!existsSync(input.config.claudeHome)) {
    throw new Error(`Claude home does not exist on daemon host: ${input.config.claudeHome}`);
  }

  const logPath = join(input.runner.jobDir, "claude.jsonl");
  const logFile = Bun.file(logPath);
  const writer = logFile.writer();

  const args = [
    "docker",
    "run",
    "--rm",
    "-v",
    `${input.runner.repoDir}:/workspace`,
    "-v",
    `${input.config.claudeHome}:/home/node/.claude`,
    "-w",
    "/workspace",
    "-e",
    "CLAUDE_HOME=/home/node/.claude",
  ];

  // Forward ANTHROPIC_API_KEY from the daemon environment if present
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    args.push("-e", `ANTHROPIC_API_KEY=${apiKey}`);
  }

  args.push(
    input.config.claudeImageName,
    "claude",
    "--dangerously-skip-permissions",
    "--output-format",
    "stream-json",
    "-m",
    input.runner.job.model,
    "-p",
    input.runner.job.prompt,
  );

  input.store.addEvent(input.runner.job.id, "info", `Starting Claude Docker: ${input.config.claudeImageName}`);
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
