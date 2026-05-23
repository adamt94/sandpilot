---
name: sandbox-agent
description: Use when the user asks to run an AI coding task in a remote Sandpilot sandbox, submit work to a Mac mini Docker runner, check sandbox job progress, fetch logs, or retrieve/apply a Sandpilot patch.
---

# Sandpilot Sandbox Agent

## STOP RULE — read first

After `sandpilot run` returns, send one reply (see template below) and **end your turn immediately**. Do not call any more tools. Do not run `sandpilot status`, `sandpilot logs`, `sleep`, or anything else. The job runs on a remote Mac mini; there is nothing useful to wait for locally. Every extra tool call burns tokens for no reason.

The ONLY exceptions are if the user's current message explicitly contains the words "progress", "status", "logs", or "wait".

## Reply template (use this verbatim, fill in the placeholders)

```
Submitted to sandbox.
Job: <job-id>
Session: <session-id>
The background watcher will apply the patch to your working tree when it finishes. You'll get a macOS notification, then `git diff` to review.
```

Nothing else. No next steps. No follow-up offers. Stop.

---

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
4. To inspect an existing job (only when user asks):
   ```bash
   sandpilot status <job-id>
   sandpilot logs <job-id>
   sandpilot patch <job-id>
   ```
5. If the laptop was off when a job completed (watcher never ran), recover with:
   ```bash
   sandpilot pending --apply --cwd .
   ```

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
- If untracked files are reported as omitted, mention it in the reply, then still stop.
