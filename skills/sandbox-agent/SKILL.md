---
name: sandbox-agent
description: Use when the user asks to run an AI coding task in a remote Sandpilot sandbox, submit work to a Mac mini Docker runner, check sandbox job progress, fetch logs, or retrieve/apply a Sandpilot patch.
---

# Sandpilot Sandbox Agent

Use the `sandpilot` CLI as the source of truth for remote sandbox work.

## Workflow

1. For a new task, run:
   ```bash
   sandpilot run "<prompt>" --cwd . --stream
   ```
2. If `sandpilot` is not on PATH, use:
   ```bash
   bun run /Users/adamthompson/Documents/Dev/github/sandpilot/src/cli/index.ts run "<prompt>" --cwd . --stream
   ```
3. To inspect an existing job:
   ```bash
   sandpilot status <job-id>
   sandpilot logs <job-id>
   sandpilot patch <job-id>
   ```
4. Only apply a returned patch when the user explicitly asks:
   ```bash
   sandpilot apply <job-id>
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
- Do not auto-apply patches.
- If untracked files are reported as omitted, tell the user before relying on the job result.
