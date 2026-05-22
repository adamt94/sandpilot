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
   sandpilot run "$ARGUMENTS" --cwd . --apply --detach
   ```

4. To continue an existing sandbox session instead of starting fresh:

   ```bash
   sandpilot run "$ARGUMENTS" --continue <session-id> --apply --detach
   ```

5. Report the job id, final status, session id, and whether the patch was applied.

Do not run an additional `sandpilot apply <job-id>` unless automatic apply failed or the user explicitly asks.
