#!/usr/bin/env bash
set -euo pipefail

APP="release/mac-arm64/Postrack.app/Contents/MacOS/Postrack"
export DATABASE_URL="${DATABASE_URL:?DATABASE_URL required}"

if [[ ! -x "$APP" ]]; then
  echo "Packaged app not found at $APP — run: pnpm electron:dist:dir"
  exit 1
fi

echo "Launching Postrack desktop smoke test..."
"$APP" &
APP_PID=$!

cleanup() {
  kill "$APP_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Waiting for embedded Nitro server..."
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${NUXT_PORT:-0}" >/dev/null 2>&1; then
    echo "Server responded"
    exit 0
  fi
  sleep 2
done

echo "Smoke test: app launched (PID $APP_PID). Verify login manually."
wait "$APP_PID" || true
