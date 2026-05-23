import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import type { ArtifactKind, ArtifactRecord, JobEvent, JobRecord, JobStatus, SessionRecord, ThinkingLevel } from "../shared/types";

type JobRow = {
  id: string;
  session_id: string | null;
  repo_name: string;
  source_head: string;
  source_branch: string;
  source_remote_url: string | null;
  status: JobStatus;
  model: string;
  thinking: string | null;
  delivery_mode: string | null;
  requested_branch_name: string | null;
  prompt: string;
  warning: string | null;
  client_cwd: string | null;
  result_branch: string | null;
  result_applied_at: string | null;
  result_error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
};

type SessionRow = {
  id: string;
  repo_name: string;
  source_head: string;
  source_branch: string;
  source_remote_url: string | null;
  baseline: string | null;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: number;
  job_id: string;
  seq: number;
  type: JobEvent["type"];
  payload: string;
  created_at: string;
};

type ArtifactRow = {
  job_id: string;
  kind: ArtifactKind;
  path: string;
  size_bytes: number;
  created_at: string;
};

export class JobStore {
  readonly db: Database;

  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    this.db = new Database(join(dir, "sandpilot.sqlite"));
    this.db.exec(`
      create table if not exists sessions (
        id text primary key,
        repo_name text not null,
        source_head text not null,
        source_branch text not null,
        source_remote_url text,
        baseline text,
        created_at text not null,
        updated_at text not null
      );

      create table if not exists jobs (
        id text primary key,
        session_id text,
        repo_name text not null,
        source_head text not null,
        source_branch text not null,
        source_remote_url text,
        status text not null,
        model text not null,
        delivery_mode text,
        requested_branch_name text,
        prompt text not null,
        warning text,
        result_branch text,
        result_applied_at text,
        result_error text,
        created_at text not null,
        started_at text,
        finished_at text,
        exit_code integer
      );

      create table if not exists events (
        id integer primary key autoincrement,
        job_id text not null,
        seq integer not null,
        type text not null,
        payload text not null,
        created_at text not null
      );

      create table if not exists artifacts (
        job_id text not null,
        kind text not null,
        path text not null,
        size_bytes integer not null,
        created_at text not null,
        primary key (job_id, kind)
      );
    `);
    this.ensureSessionColumns();
    this.ensureJobSessionIdColumn();
  }

  createJob(input: {
    id: string;
    sessionId: string | null;
    repoName: string;
    sourceHead: string;
    sourceBranch: string;
    sourceRemoteUrl: string | null;
    model: string;
    thinking: ThinkingLevel | null;
    deliveryMode?: "patch" | "branch";
    requestedBranchName?: string | null;
    prompt: string;
    warning: string | null;
    clientCwd: string | null;
  }): JobRecord {
    const createdAt = new Date().toISOString();
    this.db
      .query(
        `insert into jobs
        (id, session_id, repo_name, source_head, source_branch, source_remote_url, status, model, thinking, delivery_mode, requested_branch_name, prompt, warning, client_cwd, created_at)
        values (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.sessionId,
        input.repoName,
        input.sourceHead,
        input.sourceBranch,
        input.sourceRemoteUrl,
        input.model,
        input.thinking,
        input.deliveryMode ?? "patch",
        input.requestedBranchName ?? null,
        input.prompt,
        input.warning,
        input.clientCwd,
        createdAt,
      );
    const job = this.getJob(input.id);
    if (!job) throw new Error("Inserted job could not be read");
    return job;
  }

  createSession(input: {
    id: string;
    repoName: string;
    sourceHead: string;
    sourceBranch: string;
    sourceRemoteUrl: string | null;
  }): SessionRecord {
    const now = new Date().toISOString();
    this.db
      .query(
        `insert into sessions
        (id, repo_name, source_head, source_branch, source_remote_url, baseline, created_at, updated_at)
        values (?, ?, ?, ?, ?, null, ?, ?)`,
      )
      .run(input.id, input.repoName, input.sourceHead, input.sourceBranch, input.sourceRemoteUrl, now, now);
    const session = this.getSession(input.id);
    if (!session) throw new Error("Inserted session could not be read");
    return session;
  }

  getSession(id: string): SessionRecord | null {
    const row = this.db.query("select * from sessions where id = ?").get(id) as SessionRow | null;
    return row ? mapSession(row) : null;
  }

  updateSessionBaseline(id: string, baseline: string): void {
    const now = new Date().toISOString();
    this.db.query("update sessions set baseline = ?, updated_at = ? where id = ?").run(baseline, now, id);
  }

  hasActiveJobForSession(sessionId: string): boolean {
    const row = this.db
      .query(
        `select 1
        from jobs
        where session_id = ?
          and status in ('queued', 'preparing', 'running')
        limit 1`,
      )
      .get(sessionId) as { 1: number } | null;
    return row !== null;
  }

  getJob(id: string): JobRecord | null {
    const row = this.db.query("select * from jobs where id = ?").get(id) as JobRow | null;
    return row ? mapJob(row) : null;
  }

  listJobs(): JobRecord[] {
    const rows = this.db
      .query("select * from jobs order by created_at desc limit 100")
      .all() as JobRow[];
    return rows.map(mapJob);
  }

  markResult(id: string, input: { branch?: string | null; appliedAt?: string | null; error?: string | null }): JobRecord | null {
    this.db
      .query(
        `update jobs
        set result_branch = coalesce(?, result_branch),
            result_applied_at = coalesce(?, result_applied_at),
            result_error = ?
        where id = ?`,
      )
      .run(input.branch ?? null, input.appliedAt ?? null, input.error ?? null, id);
    return this.getJob(id);
  }

  setStatus(id: string, status: JobStatus, exitCode?: number): void {
    const now = new Date().toISOString();
    if (status === "running") {
      this.db.query("update jobs set status = ?, started_at = ? where id = ?").run(status, now, id);
    } else if (["succeeded", "failed", "cancelled"].includes(status)) {
      this.db
        .query("update jobs set status = ?, finished_at = ?, exit_code = ? where id = ?")
        .run(status, now, exitCode ?? null, id);
    } else {
      this.db.query("update jobs set status = ? where id = ?").run(status, id);
    }
    this.addEvent(id, "status", status);
  }

  addEvent(jobId: string, type: JobEvent["type"], payload: string): void {
    const row = this.db
      .query("select coalesce(max(seq), 0) + 1 as nextSeq from events where job_id = ?")
      .get(jobId) as { nextSeq: number };
    this.db
      .query("insert into events (job_id, seq, type, payload, created_at) values (?, ?, ?, ?, ?)")
      .run(jobId, row.nextSeq, type, payload, new Date().toISOString());
  }

  listEvents(jobId: string, afterSeq = 0): JobEvent[] {
    const rows = this.db
      .query("select * from events where job_id = ? and seq > ? order by seq asc")
      .all(jobId, afterSeq) as EventRow[];
    return rows.map(mapEvent);
  }

  upsertArtifact(jobId: string, kind: ArtifactKind, path: string): void {
    const sizeBytes = statSync(path).size;
    this.db
      .query(
        `insert into artifacts (job_id, kind, path, size_bytes, created_at)
        values (?, ?, ?, ?, ?)
        on conflict(job_id, kind) do update set
          path = excluded.path,
          size_bytes = excluded.size_bytes,
          created_at = excluded.created_at`,
      )
      .run(jobId, kind, path, sizeBytes, new Date().toISOString());
  }

  getArtifact(jobId: string, kind: ArtifactKind): ArtifactRecord | null {
    const row = this.db
      .query("select * from artifacts where job_id = ? and kind = ?")
      .get(jobId, kind) as ArtifactRow | null;
    return row ? mapArtifact(row) : null;
  }

  private ensureJobSessionIdColumn(): void {
    const columns = this.db.query("pragma table_info(jobs)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "session_id")) {
      this.db.exec("alter table jobs add column session_id text");
    }
    if (!columns.some((column) => column.name === "client_cwd")) {
      this.db.exec("alter table jobs add column client_cwd text");
    }
    if (!columns.some((column) => column.name === "thinking")) {
      this.db.exec("alter table jobs add column thinking text");
    }
    if (!columns.some((column) => column.name === "source_remote_url")) {
      this.db.exec("alter table jobs add column source_remote_url text");
    }
    if (!columns.some((column) => column.name === "delivery_mode")) {
      this.db.exec("alter table jobs add column delivery_mode text");
    }
    if (!columns.some((column) => column.name === "requested_branch_name")) {
      this.db.exec("alter table jobs add column requested_branch_name text");
    }
    if (!columns.some((column) => column.name === "result_branch")) {
      this.db.exec("alter table jobs add column result_branch text");
    }
    if (!columns.some((column) => column.name === "result_applied_at")) {
      this.db.exec("alter table jobs add column result_applied_at text");
    }
    if (!columns.some((column) => column.name === "result_error")) {
      this.db.exec("alter table jobs add column result_error text");
    }
  }

  private ensureSessionColumns(): void {
    const columns = this.db.query("pragma table_info(sessions)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "source_remote_url")) {
      this.db.exec("alter table sessions add column source_remote_url text");
    }
  }
}

function mapJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    repoName: row.repo_name,
    sourceHead: row.source_head,
    sourceBranch: row.source_branch,
    sourceRemoteUrl: row.source_remote_url,
    status: row.status,
    model: row.model,
    thinking: (row.thinking as ThinkingLevel) ?? null,
    deliveryMode: row.delivery_mode === "branch" ? "branch" : "patch",
    requestedBranchName: row.requested_branch_name,
    prompt: row.prompt,
    warning: row.warning,
    clientCwd: row.client_cwd,
    resultBranch: row.result_branch,
    resultAppliedAt: row.result_applied_at,
    resultError: row.result_error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    exitCode: row.exit_code,
  };
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    repoName: row.repo_name,
    sourceHead: row.source_head,
    sourceBranch: row.source_branch,
    sourceRemoteUrl: row.source_remote_url,
    baseline: row.baseline,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvent(row: EventRow): JobEvent {
  return {
    id: row.id,
    jobId: row.job_id,
    seq: row.seq,
    type: row.type,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

function mapArtifact(row: ArtifactRow): ArtifactRecord {
  return {
    jobId: row.job_id,
    kind: row.kind,
    path: row.path,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}
