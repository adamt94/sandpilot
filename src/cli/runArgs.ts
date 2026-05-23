import { resolve } from "node:path";
import { getAllThinkingLevels } from "../shared/models";
import type { ThinkingLevel } from "../shared/types";

export type RunOptions = {
  prompt: string;
  cwd: string;
  stream: boolean;
  apply: boolean;
  detach: boolean;
  branch: boolean;
  branchName: string | null;
  model: string | null;
  thinking: ThinkingLevel | null;
  continueSession: string | null;
};

export function parseRunArgs(inputArgs: string[]): RunOptions {
  let cwd = process.cwd();
  let stream = false;
  let apply = true;
  let detach = true;
  let branch = false;
  let branchName: string | null = null;
  let model: string | null = null;
  let thinking: ThinkingLevel | null = null;
  let continueSession: string | null = null;
  let forceNewSession = false;
  let explicitDetach = false;
  const promptParts: string[] = [];

  for (let index = 0; index < inputArgs.length; index += 1) {
    const value = inputArgs[index];
    if (value === "--cwd" || value === "-C") {
      const next = inputArgs[index + 1];
      if (!next) throw new Error(`${value} requires a directory`);
      cwd = resolve(next);
      index += 1;
    } else if (value === "--model" || value === "-m") {
      const next = inputArgs[index + 1];
      if (!next) throw new Error(`${value} requires a model`);
      model = next;
      index += 1;
    } else if (value === "--thinking" || value === "-t") {
      const next = inputArgs[index + 1];
      const valid = getAllThinkingLevels();
      if (!next || !valid.includes(next)) throw new Error(`${value} requires one of: ${valid.join(", ")}`);
      thinking = next as ThinkingLevel;
      index += 1;
    } else if (value === "--continue") {
      const next = inputArgs[index + 1];
      if (!next) throw new Error(`${value} requires a session id`);
      if (forceNewSession) throw new Error("--continue cannot be used with --new-session");
      continueSession = next;
      index += 1;
    } else if (value === "--new-session") {
      if (continueSession) throw new Error("--new-session cannot be used with --continue");
      forceNewSession = true;
    } else if (value === "--stream") {
      stream = true;
      detach = false;
    } else if (value === "--apply" || value === "--auto-apply") {
      apply = true;
      branch = false;
    } else if (value === "--branch" || value === "--push-branch") {
      branch = true;
      apply = false;
    } else if (value === "--branch-name") {
      const next = inputArgs[index + 1];
      if (!next) throw new Error(`${value} requires a branch name`);
      branchName = next;
      branch = true;
      apply = false;
      index += 1;
    } else if (value === "--detach" || value === "--background") {
      detach = true;
      explicitDetach = true;
    } else if (value) {
      promptParts.push(value);
    }
  }

  const prompt = promptParts.join(" ").trim();
  if (!prompt) throw new Error("run requires a prompt");
  if (stream && explicitDetach) throw new Error("--detach cannot be used with --stream");
  if (detach && !apply && !branch) throw new Error("--detach requires --apply or --branch");
  if (stream && branch) throw new Error("--branch cannot be used with --stream");
  return { prompt, cwd, stream, apply, detach, branch, branchName, model, thinking, continueSession };
}
