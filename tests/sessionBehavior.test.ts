import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandpilotDaemon } from "../src/daemon/server";
import { JobStore } from "../src/daemon/store";
import { prepareRepo } from "../src/runner/codexDockerRunner";
import type { DaemonConfig, JobRecord } from "../src/shared/types";

function runGit(args: string[], cwd: string): string {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(proc.stderr).trim() || `git ${args.join(" ")} failed`);
  }
  return new TextDecoder().decode(proc.stdout).trim();
}

function runGitRaw(args: string[], cwd: string): string {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(proc.stderr).trim() || `git ${args.join(" ")} failed`);
  }
  return new TextDecoder().decode(proc.stdout);
}

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function createSourceRepo(root: string): { bundlePath: string; diffPath: string; head: string; branch: string } {
  mkdirSync(root, { recursive: true });
  runGit(["init"], root);
  runGit(["config", "user.name", "Tests"], root);
  runGit(["config", "user.email", "tests@example.com"], root);
  writeFileSync(join(root, "tracked.txt"), "base\n");
  runGit(["add", "tracked.txt"], root);
  runGit(["commit", "-m", "init"], root);
  writeFileSync(join(root, "tracked.txt"), "base\nlocal change\n");

  const bundlePath = join(root, "repo.bundle");
  const diffPath = join(root, "worktree.diff");
  runGit(["bundle", "create", bundlePath, "HEAD", "--branches", "--tags"], root);
  writeFileSync(diffPath, runGitRaw(["diff", "--binary", "HEAD"], root));

  return {
    bundlePath,
    diffPath,
    head: runGit(["rev-parse", "HEAD"], root),
    branch: runGit(["rev-parse", "--abbrev-ref", "HEAD"], root),
  };
}

async function submitJob(daemon: SandpilotDaemon, body: object): Promise<Response> {
  return (daemon as unknown as { handle(request: Request): Promise<Response> }).handle(
    new Request("http://127.0.0.1:7349/v1/jobs", {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("sandbox sessions", () => {
  test("daemon can continue an existing session and blocks concurrent reuse", async () => {
    const jobsDir = tempDir("sandpilot-daemon-");
    const config: DaemonConfig = {
      host: "127.0.0.1",
      port: 7349,
      token: "test-token",
      imageName: "sandpilot-codex:latest",
      jobsDir,
      codexHome: jobsDir,
      maxConcurrentJobs: 0,
    };
    const daemon = new SandpilotDaemon(config);

    const initial = await submitJob(daemon, {
      sessionMode: "new",
      repoName: "demo",
      sourceHead: "abc123",
      sourceBranch: "main",
      prompt: "first task",
      model: "gpt-5.4",
      bundleBase64: Buffer.from("bundle").toString("base64"),
      diff: "",
    });
    expect(initial.status).toBe(202);
    const initialBody = (await initial.json()) as { job: JobRecord };
    expect(initialBody.job.sessionId).toMatch(/^session_/);

    const notReady = await submitJob(daemon, {
      sessionMode: "continue",
      sessionId: initialBody.job.sessionId,
      prompt: "follow up",
      model: "gpt-5.4",
    });
    expect(notReady.status).toBe(409);

    daemon.store.setStatus(initialBody.job.id, "succeeded", 0);
    daemon.store.updateSessionBaseline(initialBody.job.sessionId!, "baseline123");

    const followUp = await submitJob(daemon, {
      sessionMode: "continue",
      sessionId: initialBody.job.sessionId,
      prompt: "follow up",
      model: "gpt-5.4",
    });
    expect(followUp.status).toBe(202);
    const followUpBody = (await followUp.json()) as { job: JobRecord };
    expect(followUpBody.job.sessionId).toBe(initialBody.job.sessionId);
    expect(followUpBody.job.sourceHead).toBe("abc123");

    const concurrent = await submitJob(daemon, {
      sessionMode: "continue",
      sessionId: initialBody.job.sessionId,
      prompt: "one more",
      model: "gpt-5.4",
    });
    expect(concurrent.status).toBe(409);
  });

  test("prepareRepo reuses the same repo for continued sessions", async () => {
    const root = tempDir("sandpilot-runner-");
    const source = join(root, "source");
    const { bundlePath, diffPath, head, branch } = createSourceRepo(source);
    const store = new JobStore(join(root, "jobs"));
    const session = store.createSession({
      id: "session_test",
      repoName: "source",
      sourceHead: head,
      sourceBranch: branch,
    });

    const firstJob = store.createJob({
      id: "job_first",
      sessionId: session.id,
      repoName: "source",
      sourceHead: head,
      sourceBranch: branch,
      model: "gpt-5.4",
      prompt: "first task",
      warning: null,
    });
    const sessionDir = join(root, "sessions", session.id);
    const repoDir = join(sessionDir, "repo");
    const firstBaseline = await prepareRepo(
      {
        job: firstJob,
        jobDir: join(root, "job_first"),
        sessionDir,
        repoDir,
        bundlePath,
        diffPath,
      },
      store,
    );

    expect(store.getSession(session.id)?.baseline).toBe(firstBaseline);
    expect(await Bun.file(join(repoDir, "tracked.txt")).text()).toBe("base\nlocal change\n");

    writeFileSync(join(repoDir, "follow-up.txt"), "remote change\n");
    const secondJob = store.createJob({
      id: "job_second",
      sessionId: session.id,
      repoName: "source",
      sourceHead: head,
      sourceBranch: branch,
      model: "gpt-5.4",
      prompt: "second task",
      warning: null,
    });
    const secondBaseline = await prepareRepo(
      {
        job: secondJob,
        jobDir: join(root, "job_second"),
        sessionDir,
        repoDir,
        bundlePath: join(root, "unused.bundle"),
        diffPath: join(root, "unused.diff"),
      },
      store,
    );

    expect(secondBaseline).toBe(firstBaseline);
    expect(await Bun.file(join(repoDir, "follow-up.txt")).text()).toBe("remote change\n");
  });
});
