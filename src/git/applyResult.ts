import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "../shared/shell";

export async function applyPatchText(patchText: string, cwd: string): Promise<string[]> {
  if (!patchText.trim()) return [`no patch to apply`];

  const messages: string[] = [];
  const tempDir = mkdtempSync(join(tmpdir(), "sandpilot-apply-"));
  const patchPath = join(tempDir, "result.patch");
  writeFileSync(patchPath, patchText);

  try {
    await runCommand(["git", "apply", "--whitespace=nowarn", patchPath], { cwd });
    return messages;
  } catch {}

  try {
    messages.push("clean apply failed, retrying with fuzzy context matching...");
    await runCommand(["patch", "--fuzz=3", "-p1", "-i", patchPath], { cwd });
    return messages;
  } catch {}

  messages.push("fuzzy apply failed, applying with --reject (check *.rej files for conflicts)...");
  await runCommand(["git", "apply", "--whitespace=nowarn", "--reject", patchPath], { cwd, okExitCodes: [0, 1] });
  messages.push("partial apply done - search for *.rej files to see what needs manual merging");
  return messages;
}

export async function createBranchCommitAndPush(input: {
  patchText: string;
  cwd: string;
  branchName: string;
  message: string;
}): Promise<string[]> {
  const messages: string[] = [];
  const currentBranch = (await runCommand(["git", "rev-parse", "--abbrev-ref", "HEAD"], { cwd: input.cwd })).stdout.trim();
  await runCommand(["git", "switch", "-c", input.branchName], { cwd: input.cwd });

  try {
    messages.push(...await applyPatchText(input.patchText, input.cwd));
    await runCommand(["git", "add", "-A"], { cwd: input.cwd });
    const status = (await runCommand(["git", "status", "--porcelain"], { cwd: input.cwd })).stdout.trim();
    if (!status) {
      messages.push("patch produced no working tree changes");
      return messages;
    }
    await runCommand(["git", "commit", "-m", input.message], { cwd: input.cwd });
    await runCommand(["git", "push", "-u", "origin", input.branchName], { cwd: input.cwd });
    return messages;
  } catch (error) {
    try {
      await runCommand(["git", "switch", currentBranch], { cwd: input.cwd });
    } catch {}
    throw error;
  }
}

export function defaultResultBranch(repoName: string, jobId: string): string {
  const cleanRepo = repoName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "repo";
  const cleanJob = jobId.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `sandpilot/${cleanRepo}-${cleanJob}`;
}
