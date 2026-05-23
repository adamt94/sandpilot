---
description: Send the current repo task to the Sandpilot Mac mini Docker sandbox and apply the resulting patch.
argument-hint: <task prompt>
---

# Sandbox With Sandpilot

Run "$ARGUMENTS" through Sandpilot on the Mac mini runner.

## STOP RULE

Once `sandpilot run` exits, **your turn is over**. Send the reply below and call no more tools — no status checks, no log tailing, no sleeping, no follow-up. The job runs remotely; waiting here wastes tokens.

Exception: if the user's message contains "progress", "status", "logs", or "wait" you may check.

## Reply (send exactly this after a successful submit)

```
Submitted to sandbox.
Job: <job-id>
Session: <session-id>
Patch will be applied automatically when the job finishes — you'll get a macOS notification, then `git diff` to review.
```

---

## Preflight

Check the daemon through the local tunnel:

```bash
curl -fsS http://127.0.0.1:7349/health
```

If unavailable, tell the user to run:

```bash
sandpilot-tunnel
```

## Run

From the current git repository:

```bash
sandpilot run "$ARGUMENTS" --cwd . --apply --detach
```

To continue the most recent remote sandbox session instead of starting fresh:

```bash
sandpilot run "$ARGUMENTS" --continue <session-id> --apply --detach
```

## Laptop was off / watcher died

If the laptop was closed while a job ran, recover missed patches with:

```bash
sandpilot pending --apply --cwd .
```
