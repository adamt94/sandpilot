---
description: Run the current repo task through Sandpilot on the Mac mini Docker runner.
---

# Sandpilot Sandbox

Submit the current repository and "$ARGUMENTS" to Sandpilot.

## Preflight

1. Confirm `sandpilot` is available on PATH, or use `bun run /Users/adamthompson/Documents/Dev/github/sandpilot/src/cli/index.ts`.
2. Confirm this command is being run inside a git repository.
3. Confirm the SSH tunnel to the Mac mini is open:

```bash
curl -fsS http://127.0.0.1:7349/health
```

If the tunnel is missing, tell the user to run:

```bash
ssh -N -L 7349:127.0.0.1:7349 mac-mini
```

## Run

Execute:

```bash
sandpilot run "$ARGUMENTS" --cwd .
```

If `sandpilot` is not on PATH, execute:

```bash
bun run /Users/adamthompson/Documents/Dev/github/sandpilot/src/cli/index.ts run "$ARGUMENTS" --cwd .
```

## Response

Default behavior is fire-and-forget. After `sandpilot run` returns, report only the submitted job id, session id, that auto-apply is running in the background, and that the user can review later with `git diff`. Then stop.

Do not poll `sandpilot status`, sleep, tail logs, or wait for completion unless the user explicitly asks for progress, status, logs, or the final result.
