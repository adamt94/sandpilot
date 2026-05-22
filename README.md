# Sandpilot

> Run AI coding tasks on a Mac mini. Submit a job from any project, close your laptop, come back to a reviewable patch.

## Quick Start

**1. One-time setup** (run from this repo):
```bash
scripts/bootstrap.sh nova@novas-mac-mini.local
ssh -t nova@novas-mac-mini.local 'claude auth login'
sandpilot setup api-key sk-ant-...
```

**2. Start your session:**
```bash
sandpilot start
```

**3. Run a task** (from any git repo):
```bash
sandpilot run "your task here" --cwd . --apply --detach
```

Done! You'll get a notification when it's ready. Review with `git diff`.

---

## Requirements

**Your laptop:** `ssh`, `rsync`, `git`, `node`, [Bun](https://bun.sh)  
**Mac mini:** SSH Remote Login enabled, Docker Desktop running, Node/npm

<details>
<summary>Installation help</summary>

**On your laptop:**
```bash
brew install node
curl -fsSL https://bun.sh/install | bash
```

**On Mac mini:**
```bash
# Enable SSH: System Settings → General → Sharing → Remote Login
brew install node docker
```

</details>

---

## Detailed Setup

<details>
<summary>Step-by-step installation</summary>

### 1. Bootstrap

From this repository on your laptop:

```bash
scripts/bootstrap.sh nova@novas-mac-mini.local
```

Replace `nova@novas-mac-mini.local` with your Mac mini's hostname or IP. This installs dependencies on both machines and starts the daemon.

### 2. Authenticate Claude

On the Mac mini, log in to Claude:

```bash
ssh -t nova@novas-mac-mini.local 'claude auth login'
```

### 3. Add API Key

Get your Anthropic API key from [console.anthropic.com](https://console.anthropic.com/settings/keys), then:

```bash
sandpilot setup api-key sk-ant-...
```

### 4. Start Using

Every time you open your laptop:

```bash
sandpilot start
```

This starts the tunnel, checks the daemon, and applies any patches you missed while offline.

</details>

---

## Usage

**Run a task:**
```bash
sandpilot run "your task here" --cwd . --apply --detach
```

**From Claude Code:**
```
/sandbox your task here
```

**Check status:**
```bash
sandpilot list              # List all jobs
sandpilot status <job-id>   # Check specific job
sandpilot logs <job-id>     # View logs
```

---

## Advanced Features

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
<summary><strong>Model Selection</strong></summary>

Use a specific Claude model for your task:

```bash
sandpilot run "your task" --cwd . --model claude-opus-4-7 --apply --detach
```

Available models: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`

</details>

<details>
<summary><strong>Continuing Sessions</strong></summary>

Continue from a previous sandbox session with conversation history:

```bash
sandpilot run "follow-up task" --continue <session-id> --apply --detach
```

</details>

<details>
<summary><strong>Manual Patch Management</strong></summary>

Apply a completed patch manually:

```bash
sandpilot apply <job-id>
```

Useful when `--apply` wasn't used or you want to review before applying.

</details>

<details>
<summary><strong>Remote Access</strong></summary>

Access Sandpilot when away from your home network using Tailscale.

See the [Remote Access Guide](./docs/REMOTE_ACCESS.md) for setup instructions.

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

### Common Issues

**First step:** Always run `sandpilot start` — it auto-fixes most issues (tunnel, daemon).

**Command not found:**

If `sandpilot` is not recognized after setup:
```bash
export PATH="$HOME/.local/bin:$PATH"
```
Make it permanent by adding to `~/.zshrc`.

**Check daemon health:**
```bash
ssh nova@novas-mac-mini.local 'curl -fsS http://127.0.0.1:7349/health'
```

**View daemon logs:**
```bash
ssh nova@novas-mac-mini.local 'cat ~/.sandpilot/daemon.log'
```

**Restart daemon:**
```bash
ssh nova@novas-mac-mini.local '/bin/zsh -lc "pkill -f \"src/cli/index.ts daemon start\" || true; cd ~/sandpilot && nohup bun run src/cli/index.ts daemon start > ~/.sandpilot/daemon.log 2>&1 &"'
```

</details>

---

<details>
<summary><strong>How It Works</strong></summary>

Sandpilot runs a daemon on your Mac mini that:

1. **Receives** job requests from your laptop over SSH tunnel
2. **Executes** Claude Code in isolated Docker containers
3. **Generates** git patches from the AI's changes
4. **Notifies** you when complete via macOS notification
5. **Syncs** patches back to your laptop automatically

All conversation history and patches persist on the Mac mini, so you can close your laptop mid-task without losing work.

</details>
