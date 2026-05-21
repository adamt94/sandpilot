import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import type { ArtifactKind, ArtifactRecord, JobEvent, JobRecord, JobStatus } from "../shared/types";

type JobRow = {
  id: string;
  repo_name: string;
  source_head: string;
  source_branch: string;
  status: JobStatus;
  model: string;
  prompt: string;
  warning: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
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
      create table if not exists jobs (
        id text primary key,
        repo_name text not null,
        source_head text not null,
        source_branch text not null,
        status text not null,
        model text not null,
        prompt text not null,
        warning text,
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
  }

  createJob(input: {
    id: string;
    repoName: string;
    sourceHead: string;
    sourceBranch: string;
    model: string;
    prompt: string;
    warning: string | null;
  }): JobRecord {
    const createdAt = new Date().toISOString();
    this.db
      .query(
        `insert into jobs
        (id, repo_name, source_head, source_branch, status, model, prompt, warning, created_at)
        values (?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.repoName,
        input.sourceHead,
        input.sourceBranch,
        input.model,
        input.prompt,
        input.warning,
        createdAt,
      );
    const job = this.getJob(input.id);
    if (!job) throw new Error("Inserted job could not be read");
    return job;
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
}

function mapJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    repoName: row.repo_name,
    sourceHead: row.source_head,
    sourceBranch: row.source_branch,
    status: row.status,
    model: row.model,
    prompt: row.prompt,
    warning: row.warning,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    exitCode: row.exit_code,
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
