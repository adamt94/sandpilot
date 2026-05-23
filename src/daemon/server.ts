import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DaemonConfig, JobRecord, SubmitJobRequest, SubmitJobResponse } from "../shared/types";
import { loadDaemonConfig } from "../shared/config";
import { JobStore } from "./store";
import { prepareRepo, runCodexInDocker, writePatchAndSummary } from "../runner/codexDockerRunner";
import { runClaudeOnHost } from "../runner/claudeHostRunner";
import { getModelProvider } from "../shared/models";
import { runCommand } from "../shared/shell";
import { dashboardHtml } from "./dashboard";

const USAGE_LIMIT_PATTERNS = [
  /usage.?limit/i,
  /rate.?limit/i,
  /too.?many.?requests/i,
  /overloaded/i,
  /insufficient_quota/i,
  /quota.?exceeded/i,
];

function isClaudeModel(model: string): boolean {
  return getModelProvider(model) === "anthropic" || model.startsWith("claude");
}

function eventsContainUsageLimit(store: JobStore, jobId: string): boolean {
  const events = store.listEvents(jobId);
  return events.some((e) => USAGE_LIMIT_PATTERNS.some((p) => p.test(e.payload)));
}

type RunningJob = {
  controller: AbortController;
};

export class SandpilotDaemon {
  readonly config: DaemonConfig;
  readonly store: JobStore;
  readonly running = new Map<string, RunningJob>();
  private processing = false;

  constructor(config = loadDaemonConfig()) {
    this.config = config;
    mkdirSync(config.jobsDir, { recursive: true });
    this.store = new JobStore(config.jobsDir);
  }

  start(): void {
    Bun.serve({
      hostname: this.config.host,
      port: this.config.port,
      fetch: (request) => this.handle(request),
    });
    console.log(`sandpilot daemon listening on http://${this.config.host}:${this.config.port}`);
  }

  private async handle(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const parts = url.pathname.split("/").filter(Boolean);

      if (request.method === "GET" && url.pathname === "/") return this.dashboard();
      if (!this.authorized(request)) return text("unauthorized", 401);
      if (request.method === "GET" && url.pathname === "/health") return json({ ok: true });
      if (request.method === "POST" && url.pathname === "/v1/jobs") return this.submit(request);
      if (request.method === "GET" && url.pathname === "/v1/jobs") return json({ jobs: this.store.listJobs() });

      if (parts[0] === "v1" && parts[1] === "jobs" && parts[2]) {
        const jobId = parts[2];
        if (request.method === "GET" && parts.length === 3) return this.getJob(jobId);
        if (request.method === "GET" && parts[3] === "events") return this.getEvents(jobId, url);
        if (request.method === "GET" && parts[3] === "logs") return this.getLogs(jobId);
        if (request.method === "GET" && parts[3] === "patch") return this.getPatch(jobId);
        if (request.method === "POST" && parts[3] === "cancel") return this.cancel(jobId);
      }

      return text("not found", 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return text(message, 500);
    }
  }

  private authorized(request: Request): boolean {
    if (new URL(request.url).pathname === "/health") return true;
    return request.headers.get("authorization") === `Bearer ${this.config.token}`;
  }

  private async submit(request: Request): Promise<Response> {
    const body = (await request.json()) as SubmitJobRequest;
    const id = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const jobDir = join(this.config.jobsDir, id);
    mkdirSync(jobDir, { recursive: true });

    const requestedMode = body.sessionMode ?? (body.sessionId ? "continue" : "new");
    let job: JobRecord;

    if (requestedMode === "continue") {
      if (!body.sessionId) return text("sessionId is required to continue a session", 400);
      const session = this.store.getSession(body.sessionId);
      if (!session) return text("session not found", 404);
      if (!session.baseline) return text("session is not ready to continue yet", 409);
      if (this.store.hasActiveJobForSession(session.id)) return text("session already has an active job", 409);

      job = this.store.createJob({
        id,
        sessionId: session.id,
        repoName: session.repoName,
        sourceHead: session.sourceHead,
        sourceBranch: session.sourceBranch,
        model: body.model,
        thinking: body.thinking ?? null,
        prompt: body.prompt,
        warning: null,
        clientCwd: body.clientCwd ?? null,
      });
      this.store.addEvent(id, "info", `Job submitted for existing session ${session.id}`);
    } else {
      if (!body.repoName || !body.sourceHead || !body.sourceBranch || body.bundleBase64 === undefined || body.diff === undefined) {
        return text("repoName, sourceHead, sourceBranch, bundleBase64, and diff are required for a new session", 400);
      }

      const session = this.store.createSession({
        id: `session_${Date.now()}_${randomUUID().slice(0, 8)}`,
        repoName: body.repoName,
        sourceHead: body.sourceHead,
        sourceBranch: body.sourceBranch,
      });

      const bundlePath = join(jobDir, "repo.bundle");
      const diffPath = join(jobDir, "input.diff");
      writeFileSync(bundlePath, Buffer.from(body.bundleBase64, "base64"));
      writeFileSync(diffPath, body.diff);

      job = this.store.createJob({
        id,
        sessionId: session.id,
        repoName: body.repoName,
        sourceHead: body.sourceHead,
        sourceBranch: body.sourceBranch,
        model: body.model,
        thinking: body.thinking ?? null,
        prompt: body.prompt,
        warning: body.warning ?? null,
        clientCwd: body.clientCwd ?? null,
      });
      this.store.upsertArtifact(id, "bundle", bundlePath);
      this.store.upsertArtifact(id, "input-diff", diffPath);
      this.store.addEvent(id, "info", `Job submitted for new session ${session.id}`);
      if (body.warning) this.store.addEvent(id, "info", body.warning);
    }

    this.processQueue();
    return json({ job } satisfies SubmitJobResponse, 202);
  }

  private getJob(jobId: string): Response {
    const job = this.store.getJob(jobId);
    if (!job) return text("job not found", 404);
    return json({ job });
  }

  private getEvents(jobId: string, url: URL): Response {
    if (!this.store.getJob(jobId)) return text("job not found", 404);
    const after = Number(url.searchParams.get("after") ?? "0");
    return json({ events: this.store.listEvents(jobId, Number.isFinite(after) ? after : 0) });
  }

  private getLogs(jobId: string): Response {
    if (!this.store.getJob(jobId)) return text("job not found", 404);
    return text(this.store.listEvents(jobId).map((event) => `[${event.type}] ${event.payload}`).join("\n"));
  }

  private getPatch(jobId: string): Response {
    const artifact = this.store.getArtifact(jobId, "patch");
    if (!artifact) return text("patch not ready", 404);
    return new Response(readFileSync(artifact.path), {
      headers: { "content-type": "text/x-patch" },
    });
  }

  private dashboard(): Response {
    return new Response(dashboardHtml(), { headers: { "content-type": "text/html;charset=utf-8" } });
  }

  private cancel(jobId: string): Response {
    const running = this.running.get(jobId);
    if (running) {
      running.controller.abort();
      this.store.setStatus(jobId, "cancelled");
      return json({ ok: true });
    }

    const job = this.store.getJob(jobId);
    if (!job) return text("job not found", 404);
    if (job.status === "queued") {
      this.store.setStatus(jobId, "cancelled");
      return json({ ok: true });
    }
    return text(`cannot cancel job in status ${job.status}`, 409);
  }

  private processQueue(): void {
    if (this.processing) return;
    this.processing = true;
    queueMicrotask(async () => {
      try {
        while (this.running.size < this.config.maxConcurrentJobs) {
          const job = this.store.listJobs().reverse().find((candidate) => candidate.status === "queued");
          if (!job) break;
          await this.runJob(job);
        }
      } finally {
        this.processing = false;
      }
    });
  }

  private async runJob(job: JobRecord): Promise<void> {
    const controller = new AbortController();
    this.running.set(job.id, { controller });
    const jobDir = join(this.config.jobsDir, job.id);
    const runner = {
      job,
      jobDir,
      sessionDir: join(this.config.jobsDir, "sessions", job.sessionId ?? job.id),
      repoDir: join(this.config.jobsDir, "sessions", job.sessionId ?? job.id, "repo"),
      bundlePath: join(jobDir, "repo.bundle"),
      diffPath: join(jobDir, "input.diff"),
    };

    try {
      this.store.setStatus(job.id, "preparing");
      const baseline = await prepareRepo(runner, this.store);
      this.store.setStatus(job.id, "running");

      let exitCode: number;

      if (isClaudeModel(job.model)) {
        exitCode = await runClaudeOnHost({
          runner,
          config: this.config,
          store: this.store,
          signal: controller.signal,
        });

        if (exitCode !== 0 && !controller.signal.aborted && eventsContainUsageLimit(this.store, job.id)) {
          this.store.addEvent(job.id, "info", `Claude usage limit reached — falling back to Codex (${this.config.codexFallbackModel})`);
          await runCommand(["git", "reset", "--hard", baseline], { cwd: runner.repoDir });
          await runCommand(["git", "clean", "-fd"], { cwd: runner.repoDir });
          const fallbackRunner = { ...runner, job: { ...runner.job, model: this.config.codexFallbackModel } };
          exitCode = await runCodexInDocker({
            runner: fallbackRunner,
            config: this.config,
            store: this.store,
            signal: controller.signal,
          });
        }
      } else {
        exitCode = await runCodexInDocker({
          runner,
          config: this.config,
          store: this.store,
          signal: controller.signal,
        });
      }

      await writePatchAndSummary({ runner, store: this.store, baseline, exitCode });
      this.store.setStatus(job.id, exitCode === 0 ? "succeeded" : "failed", exitCode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.addEvent(job.id, "error", message);
      if (controller.signal.aborted) this.store.setStatus(job.id, "cancelled");
      else this.store.setStatus(job.id, "failed", 1);
    } finally {
      this.running.delete(job.id);
      this.processQueue();
    }
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function text(value: string, status = 200): Response {
  return new Response(value, {
    status,
    headers: { "content-type": "text/plain" },
  });
}
