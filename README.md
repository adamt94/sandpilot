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
- Codex login completed with `codex login`

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
- installs Codex CLI on the Mac mini if needed
- runs `bun install` and `bun run check`
- builds `sandpilot-codex:latest`
- starts the Mac mini daemon
- copies the daemon token into local `~/.sandpilot/client.json`
- verifies the daemon through an SSH tunnel

If Codex is not logged in on the Mac mini, run:

```bash
ssh -t nova@novas-mac-mini.local 'codex login'
```

## Daily Use

Install or repair agent app integrations:

```bash
sandpilot setup agents
sandpilot doctor agents
```

Open the tunnel in one terminal:

```bash
sandpilot-tunnel
```

From any git repo:

```bash
sandpilot run "make the requested change" --cwd . --stream
```

From Claude Code, or T3 Code with the Claude provider selected:

```text
/sandbox make the requested change
```

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

## Smoke Test

With the tunnel open:

```bash
scripts/smoke.sh
```

This creates a temporary git repo, submits a small Codex task to the Mac mini, and streams the result.

## How It Works

1. The local CLI packages the current repo as a git bundle plus a tracked worktree diff.
2. The package is sent to the daemon through `http://127.0.0.1:7349`, normally reached via SSH tunnel.
3. The Mac mini reconstructs the repo under:

   ```bash
   ~/.sandpilot/jobs/<job-id>/repo
   ```

4. Docker starts `sandpilot-codex:latest` and mounts that repo as:

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

## Troubleshooting

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
- Sandpilot returns patches by default; it does not auto-apply changes.
- Untracked files in the local repo are reported as omitted in this first version.
