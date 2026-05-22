# Sandpilot Agent Instructions

Sandpilot runs coding-agent tasks on the Mac mini inside Docker and returns a patch.

Use this when the user asks to run work in a sandbox, run an AI task remotely, use the Mac mini runner, or avoid touching the current working tree directly.

## Known Runner

- SSH host: `nova@novas-mac-mini.local`
- Daemon tunnel: local `127.0.0.1:7349` to Mac mini `127.0.0.1:7349`
- Remote project path: `/Users/nova/sandpilot`
- Local project path: `/Users/adamthompson/Documents/Dev/github/sandpilot`
- Daemon data: `/Users/nova/.sandpilot/jobs`

## Normal Use

Install or repair local agent app integrations:

```bash
sandpilot setup agents
sandpilot doctor agents
```

Open the tunnel in one terminal:

```bash
sandpilot-tunnel
```

From any git repository, submit a job:

```bash
sandpilot run "TASK PROMPT" --cwd . --apply
```

Inspect outputs:

```bash
sandpilot status <job-id>
sandpilot logs <job-id>
sandpilot patch <job-id>
```

If automatic apply was not used, only apply a patch when the user explicitly asks:

```bash
sandpilot apply <job-id>
```

## If `sandpilot` Is Missing

Use the absolute wrapper:

```bash
/Users/adamthompson/Documents/Dev/github/sandpilot/bin/sandpilot run "TASK PROMPT" --cwd . --apply
```

Or call the TypeScript entrypoint directly:

```bash
bun run /Users/adamthompson/Documents/Dev/github/sandpilot/src/cli/index.ts run "TASK PROMPT" --cwd . --apply
```

## Health Checks

Check tunnel/daemon:

```bash
curl -fsS http://127.0.0.1:7349/health
```

Check remote daemon:

```bash
ssh nova@novas-mac-mini.local 'lsof -nP -iTCP:7349 -sTCP:LISTEN || true'
```

Check sandbox container tools:

```bash
ssh nova@novas-mac-mini.local 'cd ~/sandpilot && bun run src/cli/index.ts daemon sandbox-doctor'
```

Restart remote daemon:

```bash
ssh nova@novas-mac-mini.local '/bin/zsh -lc "pkill -f \"src/cli/index.ts daemon start\" || true; mkdir -p ~/.sandpilot; cd ~/sandpilot && nohup bun run src/cli/index.ts daemon start > ~/.sandpilot/daemon.log 2>&1 &"'
```

## Safety Rules

- Agent command integrations use `--apply` by default to avoid streaming remote Codex logs into the parent agent. If a run was submitted without `--apply`, do not apply the patch unless the user asks.
- Warn if Sandpilot reports untracked files were omitted.
- The Mac mini owns Codex auth.
- Docker runs on the Mac mini, not this MacBook.
- Returned patches are the contract back to the local checkout.
