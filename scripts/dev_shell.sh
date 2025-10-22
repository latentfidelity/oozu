#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$ROOT_DIR/tools/node/bin:$PATH"

if [[ $# -gt 0 ]]; then
  exec "$@"
else
  exec "${SHELL:-/bin/bash}"
fi
