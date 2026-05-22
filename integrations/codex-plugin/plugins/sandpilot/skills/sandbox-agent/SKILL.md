---
name: sandbox-agent
description: Use when the user asks to run an AI coding task in a remote Sandpilot sandbox, submit work to a Mac mini Docker runner, check sandbox job progress, fetch logs, or retrieve/apply a Sandpilot patch.
---

# Sandpilot Sandbox Agent

Use the `sandpilot` CLI as the source of truth for remote sandbox work.

Start the tunnel if needed:

```bash
sandpilot-tunnel
```

Run a task from a git repo:

```bash
sandpilot run "<prompt>" --cwd . --apply --detach
```

Continue an existing sandbox session:

```bash
sandpilot run "<prompt>" --continue <session-id> --apply --detach
```

Inspect results:

```bash
sandpilot status <job-id>
sandpilot logs <job-id>
sandpilot patch <job-id>
```

Agent-triggered runs use `--apply --detach`, so the parent agent exits after submission while a local watcher applies the patch when the remote job finishes. Only run a separate `sandpilot apply <job-id>` if automatic apply failed or the user asks.
