---
description: Send the current repo task to the Sandpilot Mac mini Docker sandbox and apply the resulting patch.
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
sandpilot run "$ARGUMENTS" --cwd . --apply --detach
```

To continue the most recent remote sandbox state instead of starting fresh, use:

```bash
sandpilot run "$ARGUMENTS" --continue <session-id> --apply --detach
```

## Result

Report the job id, final status, session id, and whether the patch was applied. If automatic apply failed, report the patch command:

```bash
sandpilot patch <job-id>
```

Do not run an additional `sandpilot apply` unless automatic apply failed or the user explicitly asks.
