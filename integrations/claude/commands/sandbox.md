---
description: Send the current repo task to the Sandpilot Mac mini Docker sandbox and stream progress.
argument-hint: <task prompt>
---

# Sandbox With Sandpilot

Run "$ARGUMENTS" through Sandpilot on the Mac mini runner.

## Preflight

Check the daemon through the local tunnel:

```bash
curl -fsS http://127.0.0.1:7349/health
```

If unavailable, tell the user to start:

```bash
sandpilot-tunnel
```

## Run

From the current git repository:

```bash
sandpilot run "$ARGUMENTS" --cwd . --stream
```

## Result

Report the job id, final status, and patch command:

```bash
sandpilot patch <job-id>
```

Do not apply the patch unless the user explicitly asks.
