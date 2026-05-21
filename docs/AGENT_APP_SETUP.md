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
sandpilot run "fix the failing tests" --cwd . --stream
```

and return the patch command:

```bash
sandpilot patch <job-id>
```

## Notes

- The `/sandbox` command is most reliable in Claude Code and T3 Code with the Claude provider selected.
- In Codex, `$sandbox-agent` is the reliable trigger because skills are loaded directly by Codex.
- The local Codex plugin is also installed so `/sandbox` can work where Codex plugin slash commands are available.
- Returned patches are not applied unless the user explicitly asks.
