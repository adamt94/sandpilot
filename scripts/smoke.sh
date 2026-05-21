#!/usr/bin/env bash
set -euo pipefail

TASK="${1:-Create a file named hello.txt containing the single line sandpilot smoke test.}"
TMP_DIR="$(mktemp -d /tmp/sandpilot-smoke.XXXXXX)"

cd "${TMP_DIR}"
git init -q
git -c user.name=Smoke -c user.email=smoke@example.com commit --allow-empty -m init -q

echo "Smoke repo: ${TMP_DIR}"
sandpilot run "${TASK}" --cwd "${TMP_DIR}" --stream
