#!/usr/bin/env bash
# Reproducible editor-validation install. Idempotent. No signing secrets.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "setup: node $(node -v) npm $(npm -v)"
echo "setup: $(uname -s) $(uname -m) kernel $(uname -r)"

if [[ "${UDFIX_SKIP_NPM_CI:-}" == "1" && -d node_modules/electron ]]; then
  echo "setup: UDFIX_SKIP_NPM_CI=1 and node_modules present, skip npm ci"
else
  npm ci
fi

node scripts/v2-editor-fixtures.mjs
echo "setup: ok"
