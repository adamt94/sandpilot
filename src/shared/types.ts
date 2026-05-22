export type JobStatus =
  | "queued"
  | "preparing"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type SessionMode = "new" | "continue";

export type JobRecord = {
  id: string;
  sessionId: string | null;
  repoName: string;
  sourceHead: string;
  sourceBranch: string;
  status: JobStatus;
  model: string;
  prompt: string;
  warning: string | null;
  clientCwd: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
};

export type SessionRecord = {
  id: string;
  repoName: string;
  sourceHead: string;
  sourceBranch: string;
  baseline: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SubmitJobRequest = {
  sessionMode?: SessionMode;
  sessionId?: string;
  repoName?: string;
  sourceHead?: string;
  sourceBranch?: string;
  prompt: string;
  model: string;
  bundleBase64?: string;
  diff?: string;
  warning?: string;
  clientCwd?: string;
};

export type SubmitJobResponse = {
  job: JobRecord;
};

export type JobEvent = {
  id: number;
  jobId: string;
  seq: number;
  type: "status" | "stdout" | "stderr" | "info" | "error";
  payload: string;
  createdAt: string;
};

export type ArtifactKind = "bundle" | "input-diff" | "log" | "patch" | "summary" | "metadata";

export type ArtifactRecord = {
  jobId: string;
  kind: ArtifactKind;
  path: string;
  sizeBytes: number;
  createdAt: string;
};

export type DaemonConfig = {
  host: string;
  port: number;
  token: string;
  imageName: string;
  claudeImageName: string;
  jobsDir: string;
  codexHome: string;
  claudeHome: string;
  codexFallbackModel: string;
  maxConcurrentJobs: number;
};

export type ClientConfig = {
  baseUrl: string;
  token: string;
  defaultModel: string;
};

export type RunnerInput = {
  job: JobRecord;
  jobDir: string;
  sessionDir: string;
  repoDir: string;
  bundlePath: string;
  diffPath: string;
};
