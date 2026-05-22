#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="${1:-}"
REMOTE_DIR="${SANDPILOT_REMOTE_DIR:-~/sandpilot}"

if [[ -z "${REMOTE}" ]]; then
  echo "Usage: scripts/bootstrap.sh <user@mac-mini.local>"
  echo
  echo "Example:"
  echo "  scripts/bootstrap.sh nova@novas-mac-mini.local"
  exit 2
fi

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command on this machine: $1"
    exit 1
  fi
}

require ssh
require rsync
require node

echo "==> Installing local Sandpilot wrappers and Codex skill"
"${ROOT_DIR}/scripts/install-local.sh"

echo
echo "==> Checking SSH access to ${REMOTE}"
ssh -o BatchMode=yes -o ConnectTimeout=8 "${REMOTE}" 'whoami >/dev/null'

echo
echo "==> Copying Sandpilot to ${REMOTE}:${REMOTE_DIR}"
rsync -az --delete \
  --exclude node_modules \
  --exclude .sandpilot \
  --exclude .git \
  "${ROOT_DIR}/" "${REMOTE}:${REMOTE_DIR}/"

echo
echo "==> Installing remote prerequisites and building Docker image"
ssh "${REMOTE}" "SANDPILOT_REMOTE_DIR='${REMOTE_DIR}' /bin/zsh -s" <<'REMOTE_SCRIPT'
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin:$PATH"

cd "${SANDPILOT_REMOTE_DIR/#\~/$HOME}"

if ! command -v bun >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install oven-sh/bun/bun
  else
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
  fi
fi

bun install
bun run check

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or not on PATH on the Mac mini."
  echo "Install Docker Desktop, start it once, then rerun this bootstrap."
  exit 1
fi

docker ps >/dev/null

if ! command -v codex >/dev/null 2>&1; then
  if command -v npm >/dev/null 2>&1; then
    npm install -g @openai/codex
  else
    echo "npm is missing, so Codex CLI could not be installed on the Mac mini."
    exit 1
  fi
fi

if ! command -v claude >/dev/null 2>&1; then
  if command -v npm >/dev/null 2>&1; then
    npm install -g @anthropic-ai/claude-code
  else
    echo "npm is missing, so Claude Code CLI could not be installed on the Mac mini."
    exit 1
  fi
fi

mkdir -p .docker-no-creds
printf '{}\n' > .docker-no-creds/config.json
DOCKER_CONFIG="$PWD/.docker-no-creds" docker build -t sandpilot-codex:latest -f docker/Dockerfile.codex .
DOCKER_CONFIG="$PWD/.docker-no-creds" docker build -t sandpilot-claude:latest -f docker/Dockerfile.claude .
docker run --rm sandpilot-codex:latest bash /opt/sandpilot/sandbox-doctor.sh

mkdir -p "$HOME/.sandpilot"
pkill -f "src/cli/index.ts daemon start" >/dev/null 2>&1 || true
nohup bun run src/cli/index.ts daemon start > "$HOME/.sandpilot/daemon.log" 2>&1 &
sleep 1
curl -fsS http://127.0.0.1:7349/health >/dev/null

if [[ ! -f "$HOME/.codex/auth.json" ]]; then
  echo
  echo "Codex is installed but not logged in on the Mac mini (used as fallback)."
  echo "Run this after bootstrap:"
  echo "  ssh -t ${USER}@$(hostname) 'codex login'"
fi

if [[ ! -d "$HOME/.claude" ]]; then
  echo
  echo "Claude Code is installed but not logged in on the Mac mini."
  echo "Run this after bootstrap to log in:"
  echo "  ssh -t ${USER}@$(hostname) 'claude auth login'"
  echo "Or set ANTHROPIC_API_KEY in the daemon environment."
fi
REMOTE_SCRIPT

echo
echo "==> Syncing daemon token to local client config"
REMOTE_CONFIG="$(ssh "${REMOTE}" 'cat ~/.sandpilot/daemon.json')"
REMOTE_CONFIG="${REMOTE_CONFIG}" REMOTE_TARGET="${REMOTE}" SANDPILOT_ROOT_DIR="${ROOT_DIR}" node <<'NODE'
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const daemon = JSON.parse(process.env.REMOTE_CONFIG)
const registry = JSON.parse(
  fs.readFileSync(path.join(process.env.SANDPILOT_ROOT_DIR, "src/shared/models.json"), "utf8"),
)
const provider = registry.providers[registry.defaultProvider]
if (!provider) throw new Error(`Unknown default model provider: ${registry.defaultProvider}`)

const dir = path.join(os.homedir(), ".sandpilot")
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(
  path.join(dir, "client.json"),
  `${JSON.stringify(
    {
      baseUrl: `http://127.0.0.1:${daemon.port}`,
      token: daemon.token,
      defaultModel: provider.defaultModel,
    },
    null,
    2,
  )}\n`,
  { mode: 0o600 },
)
fs.writeFileSync(path.join(dir, "remote"), `${process.env.REMOTE_TARGET}\n`, { mode: 0o600 })
NODE

echo
echo "==> Verifying daemon through SSH tunnel"
if lsof -nP -iTCP:7349 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Local port 7349 is already in use. Skipping temporary tunnel verification."
else
  ssh -f -N -L 7349:127.0.0.1:7349 "${REMOTE}"
  sleep 1
  curl -fsS http://127.0.0.1:7349/health >/dev/null
  pkill -f "ssh -f -N -L 7349:127.0.0.1:7349 ${REMOTE}" >/dev/null 2>&1 || true
fi

echo
echo "Sandpilot setup complete."
echo
echo "Start the tunnel:"
echo "  sandpilot-tunnel"
echo
echo "Run from any git repo:"
echo "  sandpilot run \"your task\" --cwd . --apply --detach"
echo
if ! ssh "${REMOTE}" 'test -f ~/.codex/auth.json'; then
  echo "Before Codex fallback jobs, log Codex in on the Mac mini:"
  echo "  ssh -t ${REMOTE} 'codex login'"
fi

if ! ssh "${REMOTE}" 'test -d ~/.claude'; then
  echo
  echo "Claude Code is installed but not logged in on the Mac mini."
  echo "Log in with one of:"
  echo "  ssh -t ${REMOTE} 'claude auth login'"
  echo "Or set ANTHROPIC_API_KEY in the daemon environment:"
  echo "  ssh ${REMOTE} 'echo \"ANTHROPIC_API_KEY=<key>\" >> ~/sandpilot/.env'"
fi
