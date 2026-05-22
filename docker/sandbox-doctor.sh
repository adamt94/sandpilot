#!/usr/bin/env bash
set -euo pipefail

echo "Sandbox toolchain"
echo "node: $(node --version 2>/dev/null || echo missing)"
echo "npm: $(npm --version 2>/dev/null || echo missing)"
echo "bun: $(bun --version 2>/dev/null || echo missing)"
echo "pnpm: $(pnpm --version 2>/dev/null || echo missing)"
echo "yarn: $(yarn --version 2>/dev/null || echo missing)"
echo "git: $(git --version 2>/dev/null || echo missing)"
echo "python3: $(python3 --version 2>/dev/null || echo missing)"
echo "rg: $(rg --version 2>/dev/null | head -1 || echo missing)"
echo "codex: $(codex --version 2>/dev/null || echo missing)"
