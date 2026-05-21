# Using Sandpilot From Any Agent

Sandpilot is installed so a new Codex session or another local AI agent can send work to the Mac mini sandbox without knowing this chat history.

## One-Time Assumptions

- Mac mini SSH target: `nova@novas-mac-mini.local`
- Mac mini daemon listens on `127.0.0.1:7349`
- MacBook connects through an SSH tunnel
- CLI wrapper: `/Users/adamthompson/Documents/Dev/github/sandpilot/bin/sandpilot`

## Install Or Repair Agent Integrations

```bash
sandpilot setup agents
sandpilot doctor agents
```

## Start A Tunnel

```bash
sandpilot-tunnel
```

## Submit A Sandbox Job

From any git repository:

```bash
sandpilot run "describe the task here" --cwd . --stream
```

If `sandpilot` is not on PATH:

```bash
/Users/adamthompson/Documents/Dev/github/sandpilot/bin/sandpilot run "describe the task here" --cwd . --stream
```

## Slash Commands

Claude Code:

```text
/sandbox describe the task here
```

T3 Code:

- With the Claude provider selected, `/sandbox` should appear because T3 Code probes Claude provider slash commands.
- With Codex selected, use `$sandbox-agent` wording unless the local Sandpilot Codex plugin is installed and visible.

Codex:

```text
Use $sandbox-agent to run this in the Mac mini sandbox: describe the task here
```

If the local Sandpilot plugin is installed, this may also work:

```text
/sandbox describe the task here
```

## Review Results

```bash
sandpilot status <job-id>
sandpilot logs <job-id>
sandpilot patch <job-id>
```

Apply only after explicit user approval:

```bash
sandpilot apply <job-id>
```

## Troubleshooting

If the daemon is unreachable:

```bash
curl -fsS http://127.0.0.1:7349/health
```

If health fails, open the SSH tunnel. If the tunnel is open but health still fails, restart the daemon:

```bash
ssh nova@novas-mac-mini.local '/bin/zsh -lc "pkill -f \"src/cli/index.ts daemon start\" || true; mkdir -p ~/.sandpilot; cd ~/sandpilot && nohup bun run src/cli/index.ts daemon start > ~/.sandpilot/daemon.log 2>&1 &"'
```
