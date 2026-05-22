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
sandpilot run "$ARGUMENTS" --cwd . --apply --detach
```

If `sandpilot` is not on PATH, execute:

```bash
bun run /Users/adamthompson/Documents/Dev/github/sandpilot/src/cli/index.ts run "$ARGUMENTS" --cwd . --apply --detach
```

## Response

Report the job id, final status, session id, and whether the patch was applied.
