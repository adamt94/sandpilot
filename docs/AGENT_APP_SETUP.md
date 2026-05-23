# Agent App Setup

Sandpilot supports three practical agent entrypoints:

| App | Best command | How it is installed |
| --- | --- | --- |
| Claude Code | `/sandbox <task>` or `$sandbox-agent ...` | `~/.claude/commands/sandbox.md` plus `~/.claude/skills/sandbox-agent` |
| T3 Code with Claude provider | `/sandbox <task>` | T3 Code probes Claude slash commands |
| Codex | `$sandbox-agent ...` or `/sandbox <task>` | `~/.codex/skills/sandbox-agent` plus local Codex plugin |

## Install Or Repair

Run:

```bash
sandpilot setup agents
```

This equivalent alias is available when you are specifically repairing skills:

```bash
sandpilot setup skills
```

Check what is installed:

```bash
sandpilot doctor agents
sandpilot doctor skills
```

If `sandpilot` is not yet installed, run from the repo:

```bash
scripts/install-local.sh
```

This installs or refreshes the files that agent apps use to discover Sandpilot:

- `~/.codex/skills/sandbox-agent/SKILL.md`
- `~/.claude/skills/sandbox-agent/SKILL.md`
- `~/.claude/commands/sandbox.md`
- `~/.local/bin/sandpilot`
- `~/.local/bin/sandpilot-tunnel`
- `~/.local/bin/sandpilot-tailscale`
- the local `sandpilot@sandpilot-local` Codex plugin, when the `codex` CLI is available

## Claude And Codex Skills

Codex loads this skill from `~/.codex/skills`, and Claude Code loads it from `~/.claude/skills`. After `sandpilot setup agents` or `sandpilot setup skills`, the Sandpilot skill is available as `$sandbox-agent` in both clients.

Use it when you want Claude Code or Codex to hand work off to the Mac mini sandbox instead of editing the current working tree directly:

```text
Use $sandbox-agent to run this in the Mac mini sandbox: fix the failing tests
```

For follow-up work in the same remote sandbox state:

```text
Use $sandbox-agent to continue session <session-id>: add coverage for the parser fix
```

The skill tells Codex to submit a detached run, report the job id and session id, and stop. The local watcher applies the returned patch when the remote job finishes, so review the result with:

```bash
git diff
```

To verify or repair the skill installation:

```bash
sandpilot doctor agents
sandpilot doctor skills
sandpilot setup agents
sandpilot setup skills
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

and then stop. If automatic apply later fails, inspect:

```bash
sandpilot logs <job-id>
sandpilot patch <job-id>
```

If a job says Bun or another common tool is missing inside Docker, rebuild the Mac mini image:

```bash
ssh nova@novas-mac-mini.local 'cd ~/sandpilot && DOCKER_CONFIG=$PWD/.docker-no-creds docker build -t sandpilot-codex:latest -f docker/Dockerfile.codex .'
```

## Notes

- The `/sandbox` command is most reliable in Claude Code and T3 Code with the Claude provider selected.
- In Claude Code and Codex, `$sandbox-agent` is the reliable trigger because skills are loaded directly by those clients.
- The local Codex plugin is also installed so `/sandbox` can work where Codex plugin slash commands are available.
- Agent-triggered runs use `--apply --detach` by default. If a run was submitted without `--apply`, only run `sandpilot apply <job-id>` when the user explicitly asks.
