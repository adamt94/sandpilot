# Sandpilot

> Run AI coding tasks on a Mac mini. Submit a job from any project, close your laptop, come back to a reviewable patch.

## Quick Start

**1. One-time setup** (run from this repo):
```bash
bun run src/cli/index.ts setup nova@novas-mac-mini.local
ssh -t nova@novas-mac-mini.local 'claude auth login'
```

Use your Mac mini SSH hostname in place of `nova@novas-mac-mini.local`; it is shown here as an example. The setup command installs the local `sandpilot` wrapper, syncs this repo to the Mac mini, installs remote dependencies, and starts the daemon.

**2. Each session** (start tunnel + apply any missed patches):
```bash
sandpilot start
```

**3. Run a task** (from any git repo):
```bash
sandpilot run "your task here"
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

### 1. Run Setup

From this repository on your laptop:

```bash
bun run src/cli/index.ts setup nova@novas-mac-mini.local
```

Replace `nova@novas-mac-mini.local` with your Mac mini's SSH hostname or IP, for example `nova@your-mac-mini.local`. The example format is `user@host`.

This first command is run through Bun because a new install may not have the `sandpilot` CLI wrapper on `PATH` yet. It installs the local wrapper, syncs Sandpilot to the Mac mini, installs remote dependencies, and starts the daemon. After it finishes, use `sandpilot` for the rest of the commands.

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
sandpilot run "your task here"
```

Uses your default AI provider and model. The job runs in the background on your Mac mini — close your laptop and you'll get a notification when it's done.

**Use a specific provider:**
```bash
sandpilot run "your task" --provider claude-code
sandpilot run "your task" --provider codex
```

**Use a specific model:**
```bash
sandpilot run "your task" --model claude-opus-4-7
sandpilot run "your task" --model codex-gpt-4
```

**Push the result to a branch instead of applying locally:**
```bash
sandpilot run "your task here" --cwd . --branch --detach
```

**From Claude Code:**
```
/sandbox your task here
```

**From Claude Code with the Sandpilot skill:**
```text
Use $sandbox-agent to run this in the Mac mini sandbox: your task here
```

**From Codex with the Sandpilot skill:**
```text
Use $sandbox-agent to run this in the Mac mini sandbox: your task here
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
<summary><strong>Skills and Agent Setup</strong></summary>

Install or repair the local agent integrations:

```bash
sandpilot setup agents
# Equivalent when you only think of these as skills:
sandpilot setup skills
```

This installs:

- the `sandpilot`, `sandpilot-tunnel`, and `sandpilot-tailscale` wrappers in `~/.local/bin`
- the Codex skill at `~/.codex/skills/sandbox-agent/SKILL.md`
- the Claude skill at `~/.claude/skills/sandbox-agent/SKILL.md`
- the Claude `/sandbox` command at `~/.claude/commands/sandbox.md`
- the local Codex Sandpilot plugin when the `codex` CLI is available

Check the installed integrations:

```bash
sandpilot doctor agents
sandpilot doctor skills
```

Use the Claude or Codex skill by naming it in the prompt:

```text
Use $sandbox-agent to run this in the Mac mini sandbox: fix the failing tests
```

The skill submits the job with `--apply --detach`, reports the job and session ids, and then stops while the background watcher applies the patch when the Mac mini finishes.

For more detail, see [Agent App Setup](./docs/AGENT_APP_SETUP.md).

</details>

<details>
<summary><strong>Dashboard</strong></summary>

```bash
sandpilot dashboard
```

Opens a live view in your browser showing active jobs, history, stats, logs, source branches, and pushed result branches. Completed jobs that have not been applied show an apply button.

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
<summary><strong>Available Models</strong></summary>

**Claude Code models:**
- `claude-opus-4-7` — Most capable, best for complex tasks
- `claude-sonnet-4-6` — Balanced performance and speed
- `claude-haiku-4-5` — Fastest, good for simple tasks

**Codex models:**
- `codex-gpt-4` — OpenAI's most capable coding model
- `codex-gpt-3.5-turbo` — Faster, good for simpler tasks

Set your default with `sandpilot config model <model>` or override per-task with `--model`.

List all configured models and provider-specific thinking levels:

```bash
sandpilot models
```

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

Create and push a branch for an existing completed job:

```bash
sandpilot branch <job-id>
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
2. **Executes** your chosen AI provider (Claude Code or Codex) in isolated containers
3. **Generates** git patches from the AI's changes
4. **Notifies** you when complete via macOS notification
5. **Syncs** patches back to your laptop automatically

All conversation history and patches persist on the Mac mini, so you can close your laptop mid-task without losing work.

</details>
