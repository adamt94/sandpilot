# Agent App Setup

Sandpilot supports three practical agent entrypoints:

| App | Best command | How it is installed |
| --- | --- | --- |
| Claude Code | `/sandbox <task>` | `~/.claude/commands/sandbox.md` |
| T3 Code with Claude provider | `/sandbox <task>` | T3 Code probes Claude slash commands |
| Codex | `$sandbox-agent ...` or `/sandbox <task>` | `~/.codex/skills/sandbox-agent` plus local Codex plugin |

## Install Or Repair

Run:

```bash
sandpilot setup agents
```

Check what is installed:

```bash
sandpilot doctor agents
```

If `sandpilot` is not yet installed, run from the repo:

```bash
scripts/install-local.sh
```

## Usage

Start the tunnel:

```bash
sandpilot-tunnel
```

Away from the same network, first save the Mac mini Tailscale target:

```bash
sandpilot-tunnel --set nova@<mac-mini-tailnet-name-or-100.x-ip>
```

Then use one of these in your agent app:

```text
/sandbox fix the failing tests
```

or:

```text
Use $sandbox-agent to run this in the Mac mini sandbox: fix the failing tests
```

The agent should submit:

```bash
sandpilot run "fix the failing tests" --cwd . --apply --detach
```

For follow-up work in the same remote sandbox state, the agent can submit:

```bash
sandpilot run "continue the sandbox work" --continue <session-id> --apply --detach
```

and return whether the patch was applied. If automatic apply failed, return the patch command:

```bash
sandpilot patch <job-id>
```

If a job says Bun or another common tool is missing inside Docker, rebuild the Mac mini image:

```bash
ssh nova@novas-mac-mini.local 'cd ~/sandpilot && DOCKER_CONFIG=$PWD/.docker-no-creds docker build -t sandpilot-codex:latest -f docker/Dockerfile.codex .'
```

## Notes

- The `/sandbox` command is most reliable in Claude Code and T3 Code with the Claude provider selected.
- In Codex, `$sandbox-agent` is the reliable trigger because skills are loaded directly by Codex.
- The local Codex plugin is also installed so `/sandbox` can work where Codex plugin slash commands are available.
- Returned patches are not applied unless the user explicitly asks.
