---
name: sandbox-agent
description: Use when the user asks to run an AI coding task in a remote Sandpilot sandbox, submit work to a Mac mini Docker runner, check sandbox job progress, fetch logs, or retrieve/apply a Sandpilot patch.
---

# Sandpilot Sandbox Agent

Use the `sandpilot` CLI as the source of truth for remote sandbox work.

## Workflow

1. For a new task, run:
   ```bash
   sandpilot run "<prompt>" --cwd . --apply --detach
   ```
2. To continue an existing sandbox session, run:
   ```bash
   sandpilot run "<prompt>" --continue <session-id> --apply --detach
   ```
3. If `sandpilot` is not on PATH, use:
   ```bash
   bun run /Users/adamthompson/Documents/Dev/github/sandpilot/src/cli/index.ts run "<prompt>" --cwd . --apply --detach
   ```
4. To inspect an existing job:
   ```bash
   sandpilot status <job-id>
   sandpilot logs <job-id>
   sandpilot patch <job-id>
   ```
5. Agent-triggered runs use `--apply --detach`, so the parent agent exits after submission while a local watcher applies the patch when the remote job finishes. Only run a separate `sandpilot apply <job-id>` if automatic apply failed or the user asks.

## Default Response

For a normal sandbox request, fire and forget: submit the job, report the submitted job id and session id printed by `sandpilot run`, tell the user the patch will appear in their local git diff when the background watcher finishes, then stop immediately.

Do not poll `sandpilot status`, sleep, tail logs, or wait for completion unless the user explicitly asks for progress, status, logs, or the final result in the current message.

## Tunnel

If the daemon is unreachable, start the tunnel:

```bash
sandpilot-tunnel
```

If `sandpilot-tunnel` is unavailable:

```bash
ssh -N -L 7349:127.0.0.1:7349 nova@novas-mac-mini.local
```

## Safety

- Treat the Mac mini Docker container as the execution boundary.
- Do not upload secrets unless a project allowlist explicitly supports them.
- Do not stream remote Codex logs back to the parent agent unless the user asks for live progress.
- Do not monitor detached jobs by default; this avoids spending parent-agent tokens while the remote agent works.
- If untracked files are reported as omitted, tell the user before relying on the job result.
