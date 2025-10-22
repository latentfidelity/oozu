#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_NODE_DIR="$ROOT_DIR/tools/node"
if [[ -d "$LOCAL_NODE_DIR/bin" ]]; then
  export PATH="$LOCAL_NODE_DIR/bin:$PATH"
fi
NODE_BIN="$(command -v node || true)"
LOG_DIR="$ROOT_DIR/logs"
LOG_FILE="$LOG_DIR/oozu_bot.log"
PROCESS_PATTERN="src/index.js"

if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js is not available on PATH. Install Node 18.17+ and try again."
  exit 1
fi

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Missing .env file. Copy .env.example and set Oozu credentials before restarting."
  exit 1
fi

echo "[1/3] Stopping existing bot (if running)..."
if pgrep -f "$PROCESS_PATTERN" >/dev/null 2>&1; then
  pkill -f "$PROCESS_PATTERN" || true
  sleep 1
  if pgrep -f "$PROCESS_PATTERN" >/dev/null 2>&1; then
    echo "Bot still running, forcing shutdown."
    pkill -9 -f "$PROCESS_PATTERN" || true
  else
    echo "Bot stopped."
  fi
else
  echo "No active bot process detected."
fi

mkdir -p "$LOG_DIR"
touch "$LOG_FILE"

echo "[2/3] Starting bot..."
nohup "$NODE_BIN" "$ROOT_DIR/src/index.js" >>"$LOG_FILE" 2>&1 &
BOT_PID=$!
sleep 1

if ps -p "$BOT_PID" >/dev/null 2>&1; then
  echo "Bot launched with PID $BOT_PID. Logs: $LOG_FILE"
else
  echo "Failed to launch bot. Check $LOG_FILE for details." >&2
  exit 1
fi

echo "[3/3] Recent log output:"
tail -n 20 "$LOG_FILE" || true
