import { describe, expect, test } from "bun:test";
import { parseRunArgs } from "../src/cli/runArgs";

describe("parseRunArgs", () => {
  test("parses continuation mode", () => {
    const options = parseRunArgs(["follow up on the last change", "--continue", "session_123", "--stream"]);
    expect(options.prompt).toBe("follow up on the last change");
    expect(options.continueSession).toBe("session_123");
    expect(options.stream).toBe(true);
  });

  test("parses auto-apply mode", () => {
    const options = parseRunArgs(["fix the issue", "--apply"]);
    expect(options.prompt).toBe("fix the issue");
    expect(options.apply).toBe(true);
    expect(options.branch).toBe(false);
    expect(options.stream).toBe(false);
  });

  test("parses detached auto-apply mode", () => {
    const options = parseRunArgs(["fix the issue", "--apply", "--detach"]);
    expect(options.apply).toBe(true);
    expect(options.detach).toBe(true);
  });

  test("parses branch push mode", () => {
    const options = parseRunArgs(["fix the issue", "--branch", "--branch-name", "sandpilot/fix"]);
    expect(options.apply).toBe(false);
    expect(options.branch).toBe(true);
    expect(options.branchName).toBe("sandpilot/fix");
    expect(options.detach).toBe(true);
  });

  test("rejects conflicting session flags", () => {
    expect(() => parseRunArgs(["prompt", "--new-session", "--continue", "session_123"])).toThrow(
      "--continue cannot be used with --new-session",
    );
    expect(() => parseRunArgs(["prompt", "--continue", "session_123", "--new-session"])).toThrow(
      "--new-session cannot be used with --continue",
    );
  });

  test("rejects invalid detach combinations", () => {
    expect(() => parseRunArgs(["prompt", "--apply", "--detach", "--stream"])).toThrow(
      "--detach cannot be used with --stream",
    );
    expect(() => parseRunArgs(["prompt", "--branch", "--stream"])).toThrow(
      "--branch cannot be used with --stream",
    );
  });

  test("parses registry-backed thinking levels", () => {
    const options = parseRunArgs(["prompt", "--thinking", "xhigh"]);
    expect(options.thinking).toBe("xhigh");
    expect(() => parseRunArgs(["prompt", "--thinking", "ultra"])).toThrow(
      "--thinking requires one of: low, medium, high, xhigh",
    );
  });
});
