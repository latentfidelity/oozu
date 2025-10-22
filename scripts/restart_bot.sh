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
LEGACY_PATTERN="oozuarena.app"

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
    sleep 1
  else
    echo "Bot stopped."
  fi
else
  echo "No active bot process detected."
fi

if pgrep -f "$LEGACY_PATTERN" >/dev/null 2>&1; then
  echo "Stopping legacy Python bot..."
  pkill -f "$LEGACY_PATTERN" || true
  sleep 1
  if pgrep -f "$LEGACY_PATTERN" >/dev/null 2>&1; then
    echo "Legacy bot still running, forcing shutdown."
    pkill -9 -f "$LEGACY_PATTERN" || true
    sleep 1
  else
    echo "Legacy bot stopped."
  fi
fi

if pgrep -f "$PROCESS_PATTERN" >/dev/null 2>&1; then
  echo "Unable to stop all existing bot processes. Please resolve manually and retry." >&2
  exit 1
fi

if pgrep -f "$LEGACY_PATTERN" >/dev/null 2>&1; then
  echo "Legacy Python bot is still running. Please terminate it before restarting." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
touch "$LOG_FILE"

echo "[2/3] Starting bot..."
nohup "$NODE_BIN" "$ROOT_DIR/src/index.js" >>"$LOG_FILE" 2>&1 &
BOT_PID=$!
sleep 1

if ps -p "$BOT_PID" >/dev/null 2>&1; then
  echo "Bot launched with PID $BOT_PID. Logs: $LOG_FILE"
  EXTRA_PIDS="$(pgrep -f "$PROCESS_PATTERN" | grep -v "^$BOT_PID$" || true)"
  if [[ -n "$EXTRA_PIDS" ]]; then
    echo "Detected additional bot processes: $EXTRA_PIDS. Stopping them..."
    while read -r pid; do
      [[ -z "$pid" ]] && continue
      kill "$pid" >/dev/null 2>&1 || true
    done <<< "$EXTRA_PIDS"
    sleep 1
    while read -r pid; do
      [[ -z "$pid" ]] && continue
      if kill -0 "$pid" >/dev/null 2>&1; then
        kill -9 "$pid" >/dev/null 2>&1 || true
      fi
    done <<< "$EXTRA_PIDS"
    REMAINING_PIDS="$(pgrep -f "$PROCESS_PATTERN" | grep -v "^$BOT_PID$" || true)"
    if [[ -n "$REMAINING_PIDS" ]]; then
      echo "Warning: could not terminate extra bot processes: $REMAINING_PIDS" >&2
    else
      echo "Extra bot processes terminated."
    fi
  fi
else
  echo "Failed to launch bot. Check $LOG_FILE for details." >&2
  exit 1
fi

echo "[3/3] Recent log output:"
tail -n 20 "$LOG_FILE" || true
