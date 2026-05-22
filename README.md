# Sandpilot

Run AI coding tasks on a Mac mini inside Docker. Submit a job, close your laptop, come back to a reviewable patch.

## Requirements

**Your machine:** `ssh`, `rsync`, `git`, `node`, [Bun](https://bun.sh)

**Mac mini:**
- SSH Remote Login enabled (System Settings → Sharing)
- Docker Desktop installed and running
- Node/npm installed (via Homebrew: `brew install node`)

## First-Time Setup

Clone this repo on your machine, then run:

```bash
scripts/bootstrap.sh nova@novas-mac-mini.local
```

Replace `nova@novas-mac-mini.local` with your Mac mini SSH target. Bootstrap installs everything on both machines and starts the daemon.

**After bootstrap, log in to Claude Code on the Mac mini:**

```bash
ssh -t nova@novas-mac-mini.local 'claude auth login'
```

That's it. You're set up.

## Every Session

One command does everything — starts the tunnel, checks the daemon, applies any patches you missed while your laptop was off:

```bash
sandpilot start
```

Then open the dashboard to see what's running:

```bash
sandpilot dashboard
```

## Running Tasks

From any git repo on your machine:

```bash
sandpilot run "your task here" --cwd . --apply --detach
```

Or from Claude Code chat using the `/sandbox` slash command:

```
/sandbox your task here
```

The job runs on the Mac mini. You'll get a macOS notification when the patch is ready, then:

```bash
git diff    # review the changes
```

Continue from the same sandbox session:

```bash
sandpilot run "follow-up task" --continue <session-id> --apply --detach
```

## Dashboard

```bash
sandpilot dashboard
```

Opens a live view of active jobs, job history, and stats in your browser. Also reachable over Tailscale at `http://<mac-mini-tailscale-ip>:7349/?token=<token>` — find your token in `~/.sandpilot/client.json`.

## Laptop Recovery

If your laptop was off when a job finished, pick up any missed patches when you wake:

```bash
sandpilot pending --apply
```

To have this run automatically on every wake from sleep:

```bash
sandpilot setup wake-agent
```

## Updating

Pull the latest, sync to the Mac mini, and restart the daemon:

```bash
sandpilot update
```

## Troubleshooting

**Tunnel not connecting:**
```bash
sandpilot tunnel --stop
sandpilot tunnel --detach
```

**Daemon not responding on Mac mini:**
```bash
ssh nova@novas-mac-mini.local 'curl -fsS http://127.0.0.1:7349/health'
```
If that fails, restart it:
```bash
ssh nova@novas-mac-mini.local '/bin/zsh -lc "pkill -f \"src/cli/index.ts daemon start\" || true; cd ~/sandpilot && nohup bun run src/cli/index.ts daemon start > ~/.sandpilot/daemon.log 2>&1 &"'
```

**Check daemon logs on Mac mini:**
```bash
ssh nova@novas-mac-mini.local 'cat ~/.sandpilot/daemon.log'
```

**`sandpilot` not found after setup:**
```bash
export PATH="$HOME/.local/bin:$PATH"
```
Add that to `~/.zshrc` to make it permanent.

**Away from home network:** Use Tailscale — see [Remote Access](./docs/REMOTE_ACCESS.md).
