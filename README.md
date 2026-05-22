# Sandpilot

Run AI coding tasks on a Mac mini inside Docker. Submit a job from any project, close your laptop, come back to a reviewable patch.

---

## Requirements

| Your machine | Mac mini |
|---|---|
| `ssh`, `rsync`, `git`, `node`, [Bun](https://bun.sh) | SSH Remote Login enabled · Docker Desktop running · Node/npm (`brew install node`) |

---

## Setup

**Run once from this repo:**

```bash
scripts/bootstrap.sh nova@novas-mac-mini.local
```

Replace `nova@novas-mac-mini.local` with your Mac mini SSH target. Bootstrap installs everything on both machines and starts the daemon.

**Then log in to Claude on the Mac mini:**

```bash
ssh -t nova@novas-mac-mini.local 'claude auth login'
```

---

## Every Session

```bash
sandpilot start
```

That's it. This starts the tunnel, checks the daemon, and applies any patches you missed while your laptop was off.

---

## Running a Task

From any git repo:

```bash
sandpilot run "your task here" --cwd . --apply --detach
```

Or from Claude Code using the slash command:

```
/sandbox your task here
```

You'll get a macOS notification when the patch is ready. Then:

```bash
git diff    # review the changes
```

---

<details>
<summary><strong>Dashboard</strong></summary>

```bash
sandpilot dashboard
```

Opens a live view in your browser showing active jobs, history, stats, and logs. Auto-refreshes every 5 seconds.

To access from another machine over Tailscale, find your token in `~/.sandpilot/client.json` and open:
```
http://<mac-mini-tailscale-ip>:7349/?token=<token>
```

</details>

<details>
<summary><strong>Updating</strong></summary>

Pull the latest, sync to the Mac mini, and restart the daemon:

```bash
sandpilot update
```

</details>

<details>
<summary><strong>Advanced Usage</strong></summary>

**Continue from a previous sandbox session:**
```bash
sandpilot run "follow-up task" --continue <session-id> --apply --detach
```

**Use a specific model:**
```bash
sandpilot run "your task" --cwd . --model claude-opus-4-7 --apply --detach
```

**Check job status:**
```bash
sandpilot status <job-id>
sandpilot logs <job-id>
sandpilot list
```

**Manually apply a patch:**
```bash
sandpilot apply <job-id>
```

**Away from home network:** Use Tailscale — see [Remote Access](./docs/REMOTE_ACCESS.md).

</details>

<details>
<summary><strong>Laptop Recovery</strong></summary>

Jobs keep running on the Mac mini even when your laptop is off. `sandpilot start` handles this automatically, but you can also run it manually:

```bash
sandpilot pending --apply
```

To install a wake agent that runs this automatically every time your laptop wakes from sleep:

```bash
sandpilot setup wake-agent
```

</details>

<details>
<summary><strong>Troubleshooting</strong></summary>

**Run `sandpilot start` first** — it fixes most issues automatically (tunnel down, daemon not running).

**Check daemon health directly on Mac mini:**
```bash
ssh nova@novas-mac-mini.local 'curl -fsS http://127.0.0.1:7349/health'
```

**Restart the daemon manually:**
```bash
ssh nova@novas-mac-mini.local '/bin/zsh -lc "pkill -f \"src/cli/index.ts daemon start\" || true; cd ~/sandpilot && nohup bun run src/cli/index.ts daemon start > ~/.sandpilot/daemon.log 2>&1 &"'
```

**Read daemon logs:**
```bash
ssh nova@novas-mac-mini.local 'cat ~/.sandpilot/daemon.log'
```

**`sandpilot` not found after setup:**
```bash
export PATH="$HOME/.local/bin:$PATH"
```
Add to `~/.zshrc` to make it permanent.

</details>
