#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

status() {
  local label="$1"
  local state="$2"
  printf '%-34s %s\n' "${label}" "${state}"
}

exists() {
  [[ -e "$1" ]]
}

echo "Sandpilot agent integration doctor"
echo

if command -v sandpilot >/dev/null 2>&1; then
  status "sandpilot command" "$(command -v sandpilot)"
else
  status "sandpilot command" "missing"
fi

if command -v sandpilot-tunnel >/dev/null 2>&1; then
  status "sandpilot-tunnel command" "$(command -v sandpilot-tunnel)"
else
  status "sandpilot-tunnel command" "missing"
fi

if exists "${HOME}/.codex/skills/sandbox-agent/SKILL.md"; then
  status "Codex skill" "installed"
else
  status "Codex skill" "missing"
fi

if exists "${HOME}/.claude/skills/sandbox-agent/SKILL.md"; then
  status "Claude skill" "installed"
else
  status "Claude skill" "missing"
fi

if exists "${HOME}/.claude/commands/sandbox.md"; then
  status "Claude /sandbox command" "installed"
else
  status "Claude /sandbox command" "missing"
fi

if command -v codex >/dev/null 2>&1; then
  if codex plugin list 2>/dev/null | grep -q "sandpilot@sandpilot-local (installed, enabled)"; then
    status "Codex Sandpilot plugin" "installed"
  else
    status "Codex Sandpilot plugin" "missing"
  fi
else
  status "Codex CLI" "missing"
fi

if [[ -d "${HOME}/Documents/Dev/github/t3code" ]]; then
  status "T3 Code local repo" "found"
  status "T3 Code /sandbox path" "Claude provider command"
else
  status "T3 Code" "not detected"
fi

if curl -fsS http://127.0.0.1:7349/health >/dev/null 2>&1; then
  status "Sandpilot daemon tunnel" "reachable"
else
  status "Sandpilot daemon tunnel" "not reachable; run sandpilot-tunnel"
fi

echo
echo "Repair integrations with:"
echo "  ${ROOT_DIR}/scripts/install-local.sh"
