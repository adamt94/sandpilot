import { join } from "node:path";
import type { DaemonConfig, RunnerInput } from "../shared/types";
import { commandExists } from "../shared/shell";
import type { JobStore } from "../daemon/store";

export async function runClaudeOnHost(input: {
  runner: RunnerInput;
  config: DaemonConfig;
  store: JobStore;
  signal: AbortSignal;
}): Promise<number> {
  if (!(await commandExists("claude"))) {
    throw new Error("claude CLI is not available on PATH — run: npm install -g @anthropic-ai/claude-code");
  }

  const logPath = join(input.runner.jobDir, "claude.jsonl");
  const logFile = Bun.file(logPath);
  const writer = logFile.writer();

  // inherit the daemon's full environment so OAuth session tokens are available
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  if (input.config.anthropicApiKey) {
    env.ANTHROPIC_API_KEY = input.config.anthropicApiKey;
  }

  const args = [
    "claude",
    "--dangerously-skip-permissions",
    "--output-format", "stream-json",
    "--verbose",
    "--model", input.runner.job.model,
    "-p", input.runner.job.prompt,
  ];

  input.store.addEvent(input.runner.job.id, "info", `Starting Claude on host (model: ${input.runner.job.model})`);

  const proc = Bun.spawn(args, {
    cwd: input.runner.repoDir,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const abort = () => proc.kill();
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
