import { resolve } from "node:path";
import type { ThinkingLevel } from "../shared/types";

export type RunOptions = {
  prompt: string;
  cwd: string;
  stream: boolean;
  apply: boolean;
  detach: boolean;
  model: string | null;
  thinking: ThinkingLevel | null;
  continueSession: string | null;
};

export function parseRunArgs(inputArgs: string[]): RunOptions {
  let cwd = process.cwd();
  let stream = false;
  let apply = false;
  let detach = false;
  let model: string | null = null;
  let thinking: ThinkingLevel | null = null;
  let continueSession: string | null = null;
  let forceNewSession = false;
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
      if (!next || !["low", "medium", "high"].includes(next)) throw new Error(`${value} requires low, medium, or high`);
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
    } else if (value === "--apply" || value === "--auto-apply") {
      apply = true;
    } else if (value === "--detach" || value === "--background") {
      detach = true;
    } else if (value) {
      promptParts.push(value);
    }
  }

  const prompt = promptParts.join(" ").trim();
  if (!prompt) throw new Error("run requires a prompt");
  if (stream && detach) throw new Error("--detach cannot be used with --stream");
  if (detach && !apply) throw new Error("--detach requires --apply");
  return { prompt, cwd, stream, apply, detach, model, thinking, continueSession };
}
