# Sandpilot

Sandpilot runs AI coding-agent tasks on a Mac mini inside Docker, then returns a reviewable patch to your local machine.

You keep working in your normal project checkout. Sandpilot copies the repo state to the Mac mini, runs Codex in a temporary Docker container, stores logs/artifacts under `~/.sandpilot/jobs`, and lets you inspect or apply the resulting patch.

## Requirements

Client machine:

- macOS or Linux
- `ssh`
- `rsync`
- `git`
- `node`
- Bun, or install it before running the CLI

Mac mini runner:

- SSH Remote Login enabled
- Docker Desktop installed and running
- Node/npm or Homebrew
- Claude Code login completed with `claude auth login` (or `ANTHROPIC_API_KEY` set in daemon env)
- Codex login completed with `codex login` (used as fallback when Claude hits usage limits)

## One-Command Setup

From this repo on the client machine:

```bash
scripts/bootstrap.sh nova@novas-mac-mini.local
```

Replace `nova@novas-mac-mini.local` with your Mac mini SSH target.

The bootstrap does this:

- installs local `sandpilot` and `sandpilot-tunnel` wrappers
- installs the Codex skill at `~/.codex/skills/sandbox-agent`
- installs the Claude Code `/sandbox` command at `~/.claude/commands/sandbox.md`
- registers the local Sandpilot Codex plugin when Codex CLI is available
- copies Sandpilot to `~/sandpilot` on the Mac mini
- installs Bun on the Mac mini if needed
- installs Claude Code CLI on the Mac mini
- installs Codex CLI on the Mac mini (used as fallback)
- runs `bun install` and `bun run check`
- builds `sandpilot-codex:latest` and `sandpilot-claude:latest` Docker images
- verifies the sandbox image has Node, npm, Bun, pnpm, yarn, git, Python, ripgrep, and Codex
- starts the Mac mini daemon
- copies the daemon token into local `~/.sandpilot/client.json` with `claude-sonnet-4-5` as the default model
- verifies the daemon through an SSH tunnel

If Claude Code is not logged in on the Mac mini, run:

```bash
ssh -t nova@novas-mac-mini.local 'claude auth login'
```

Alternatively, set `ANTHROPIC_API_KEY` in the daemon environment on the Mac mini.

If Codex is not logged in on the Mac mini (needed for fallback), run:

```bash
ssh -t nova@novas-mac-mini.local 'codex login'
```

## Daily Use

Pull the latest code, sync to the Mac mini, and restart the daemon in one command:

```bash
sandpilot update
```

Install or repair agent app integrations:

```bash
sandpilot setup agents
sandpilot doctor agents
```

Open the tunnel in one terminal:

```bash
sandpilot-tunnel
```

Away from the same network, use Tailscale and save the Mac mini Tailnet SSH target:

```bash
sandpilot-tunnel --set nova@<mac-mini-tailnet-name-or-100.x-ip>
```

See [Remote Access](./docs/REMOTE_ACCESS.md).

From any git repo:

```bash
sandpilot run "make the requested change" --cwd . --apply --detach
```

Continue the same remote sandbox session:

```bash
sandpilot run "continue from the previous sandbox state" --continue <session-id> --apply --detach
```

From Claude Code (default runner — uses `claude-sonnet-4-5`, falls back to Codex on usage limit):

```bash
sandpilot run "make the requested change" --cwd . --apply --detach
```

Or via the slash command in Claude Code or T3 Code with the Claude provider selected:

```text
/sandbox make the requested change
```

To use a specific model:

```bash
sandpilot run "make the requested change" --cwd . --model claude-opus-4-5 --apply --detach
sandpilot run "make the requested change" --cwd . --model gpt-4o --apply --detach
```

Default models and provider model lists live in `src/shared/models.json`. Change `defaultProvider`, a provider `defaultModel`, or append newly released provider models there instead of chasing string literals across the CLI, daemon config, bootstrap, and tests.

From Codex, use either the Sandpilot skill wording or the installed plugin command if available:

```text
Use $sandbox-agent to run this in the Mac mini sandbox: make the requested change
```

```text
/sandbox make the requested change
```

More detail: [Agent App Setup](./docs/AGENT_APP_SETUP.md).

Review the result:

```bash
sandpilot status <job-id>
sandpilot logs <job-id>
sandpilot patch <job-id>
```

Apply only when you want the returned patch:

```bash
sandpilot apply <job-id>
```

## Dashboard

Open the web dashboard in your browser:

```bash
sandpilot dashboard
```

This opens `http://127.0.0.1:7349/?token=<your-token>` — also reachable over Tailscale at the Mac mini's address.

The dashboard shows:

- **Stats bar** — total jobs, success rate, active count, average duration, most-used model
- **Active panel** — running and queued jobs with a live elapsed timer and cancel button
- **History table** — every finished job with status, repo, model, prompt preview, duration, and age
- **Expanded row** — click any history row to see the full prompt, session ID, working directory, and event log

Auto-refreshes every 5 seconds.

### Getting the token

The bearer token is stored in `~/.sandpilot/client.json`:

```bash
cat ~/.sandpilot/client.json
```

`sandpilot dashboard` reads this automatically and embeds the token in the URL. If you want to access the dashboard from another machine over Tailscale, copy the token from that file and append it manually:

```
http://<tailscale-ip>:7349/?token=<token>
```

## Laptop Recovery

When you close your laptop while a job is running, the job keeps going on the Mac mini. The patch is stored there safely. When you wake up, apply any missed patches across all your projects in one command:

```bash
sandpilot pending --apply
```

Without `--apply` it lists what's waiting without touching anything.

To apply patches automatically every time your laptop wakes from sleep, install the wake agent once:

```bash
sandpilot setup wake-agent
```

This registers a macOS LaunchAgent that runs `sandpilot pending --apply` on every wake. You'll get a macOS notification when each patch is applied.

## Smoke Test

With the tunnel open:

```bash
scripts/smoke.sh
```

This creates a temporary git repo, submits a small Codex task to the Mac mini, and applies the result when the job completes.

## How It Works

1. The local CLI packages the current repo as a git bundle plus a tracked worktree diff.
2. The package is sent to the daemon through `http://127.0.0.1:7349`, normally reached via SSH tunnel.
3. The Mac mini reconstructs the repo under:

   ```bash
   ~/.sandpilot/jobs/sessions/<session-id>/repo
   ```

4. Docker starts `sandpilot-claude:latest` (or `sandpilot-codex:latest` for Codex/fallback jobs) and mounts that repo as:

   ```bash
   /workspace
   ```

5. Codex edits `/workspace`.
6. The container exits and is removed.
7. Sandpilot writes artifacts:

   ```bash
   ~/.sandpilot/jobs/<job-id>/codex.jsonl
   ~/.sandpilot/jobs/<job-id>/result.patch
   ~/.sandpilot/jobs/<job-id>/summary.md
   ```

8. The local CLI fetches logs and patches from the daemon.

When you continue a session, Sandpilot reuses that session repo and returns a patch for the current full session state.

## Troubleshooting

Check the Mac mini host:

```bash
sandpilot daemon doctor
```

Check the Docker sandbox toolchain on the Mac mini:

```bash
ssh nova@novas-mac-mini.local 'cd ~/sandpilot && bun run src/cli/index.ts daemon sandbox-doctor'
```

Check the tunnel/daemon:

```bash
curl -fsS http://127.0.0.1:7349/health
```

Restart the remote daemon:

```bash
ssh nova@novas-mac-mini.local '/bin/zsh -lc "pkill -f \"src/cli/index.ts daemon start\" || true; mkdir -p ~/.sandpilot; cd ~/sandpilot && nohup bun run src/cli/index.ts daemon start > ~/.sandpilot/daemon.log 2>&1 &"'
```

Read daemon logs:

```bash
ssh nova@novas-mac-mini.local 'cat ~/.sandpilot/daemon.log'
```

If `sandpilot` is not found in a new terminal:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Add that line to `~/.zshrc` if needed.

## Security Model

- Docker only runs on the Mac mini.
- The daemon binds to `127.0.0.1`, not the LAN.
- Access goes through SSH plus a bearer token.
- Codex auth stays on the Mac mini.
- Sandpilot returns patches by default for raw CLI runs. Agent integrations use `--apply --detach` so the local checkout receives the patch in the background without streaming remote Codex logs.
- Untracked files in the local repo are reported as omitted in this first version.
