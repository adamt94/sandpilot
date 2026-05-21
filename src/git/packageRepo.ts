import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { runCommand } from "../shared/shell";
import type { SubmitJobRequest } from "../shared/types";

export async function packageRepo(input: {
  cwd: string;
  prompt: string;
  model: string;
}): Promise<SubmitJobRequest> {
  const root = (await runCommand(["git", "rev-parse", "--show-toplevel"], { cwd: input.cwd })).stdout.trim();
  const sourceHead = (await runCommand(["git", "rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const sourceBranch = (
    await runCommand(["git", "rev-parse", "--abbrev-ref", "HEAD"], { cwd: root })
  ).stdout.trim();

  const tempDir = mkdtempSync(join(tmpdir(), "sandpilot-client-"));
  const bundlePath = join(tempDir, "repo.bundle");
  const diffPath = join(tempDir, "worktree.diff");

  await runCommand(["git", "bundle", "create", bundlePath, "HEAD", "--branches", "--tags"], { cwd: root });
  const diff = (await runCommand(["git", "diff", "--binary", "HEAD"], { cwd: root })).stdout;
  writeFileSync(diffPath, diff);

  const untracked = (
    await runCommand(["git", "ls-files", "--others", "--exclude-standard"], { cwd: root })
  ).stdout
    .split("\n")
    .filter(Boolean);

  const request: SubmitJobRequest = {
    repoName: basename(root),
    sourceHead,
    sourceBranch,
    prompt: input.prompt,
    model: input.model,
    bundleBase64: readFileSync(bundlePath).toString("base64"),
    diff,
  };
  if (untracked.length > 0) {
    request.warning = `Untracked files were not included: ${untracked.slice(0, 10).join(", ")}${
      untracked.length > 10 ? `, and ${untracked.length - 10} more` : ""
    }`;
  }
  return request;
}
