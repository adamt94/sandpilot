# /sandbox

Submit the current repository and prompt to the Sandpilot Mac mini Docker sandbox.

## Arguments

- `prompt`: the coding task to run remotely

## Workflow

1. Check the daemon through the local tunnel:

   ```bash
   curl -fsS http://127.0.0.1:7349/health
   ```

2. If the daemon is unavailable, tell the user to start:

   ```bash
   sandpilot-tunnel
   ```

3. Submit the job from the current git repository:

   ```bash
   sandpilot run "$ARGUMENTS" --cwd .
   ```

4. To continue an existing sandbox session instead of starting fresh:

   ```bash
   sandpilot run "$ARGUMENTS" --continue <session-id>
   ```

5. Default behavior is fire-and-forget. After `sandpilot run` returns, report only the submitted job id, session id, that auto-apply is running in the background, and that the user can review later with `git diff`. Then stop.

Do not poll `sandpilot status`, sleep, tail logs, or wait for completion unless the user explicitly asks for progress, status, logs, or the final result.

Do not run an additional `sandpilot apply <job-id>` unless automatic apply failed or the user explicitly asks.
