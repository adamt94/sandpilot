#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${HOME}/.local/bin"
SKILL_DIR="${HOME}/.codex/skills/sandbox-agent"
CLAUDE_COMMANDS_DIR="${HOME}/.claude/commands"

mkdir -p "${BIN_DIR}" "${SKILL_DIR}" "${CLAUDE_COMMANDS_DIR}"

chmod +x "${ROOT_DIR}/bin/sandpilot" "${ROOT_DIR}/bin/sandpilot-tunnel" "${ROOT_DIR}/bin/sandpilot-tailscale"
ln -sf "${ROOT_DIR}/bin/sandpilot" "${BIN_DIR}/sandpilot"
ln -sf "${ROOT_DIR}/bin/sandpilot-tunnel" "${BIN_DIR}/sandpilot-tunnel"
ln -sf "${ROOT_DIR}/bin/sandpilot-tailscale" "${BIN_DIR}/sandpilot-tailscale"
cp "${ROOT_DIR}/skills/sandbox-agent/SKILL.md" "${SKILL_DIR}/SKILL.md"
cp "${ROOT_DIR}/integrations/claude/commands/sandbox.md" "${CLAUDE_COMMANDS_DIR}/sandbox.md"

if command -v codex >/dev/null 2>&1; then
  codex plugin marketplace add "${ROOT_DIR}/integrations/codex-plugin" >/dev/null 2>&1 || true
  codex plugin add sandpilot@sandpilot-local >/dev/null 2>&1 || true
fi

echo "Installed:"
echo "  ${BIN_DIR}/sandpilot"
echo "  ${BIN_DIR}/sandpilot-tunnel"
echo "  ${BIN_DIR}/sandpilot-tailscale"
echo "  ${SKILL_DIR}/SKILL.md"
echo "  ${CLAUDE_COMMANDS_DIR}/sandbox.md"

if command -v codex >/dev/null 2>&1 && codex plugin list 2>/dev/null | grep -q "sandpilot@sandpilot-local (installed, enabled)"; then
  echo "  Codex plugin sandpilot@sandpilot-local"
fi

if ! command -v sandpilot >/dev/null 2>&1; then
  echo
  echo "Add this to your shell profile if sandpilot is not found in new terminals:"
  echo '  export PATH="$HOME/.local/bin:$PATH"'
fi
