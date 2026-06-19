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

echo "Waiting for embedded Nitro server on 127.0.0.1..."
for _ in $(seq 1 60); do
  PORT=$(
    lsof -Pan -p "$APP_PID" -iTCP -sTCP:LISTEN 2>/dev/null \
      | awk '/127\.0\.0\.1/ { split($9, a, ":"); print a[length(a)]; exit }'
  )

  if [[ -n "${PORT:-}" ]]; then
    if curl -sf "http://127.0.0.1:${PORT}/" | grep -qi '<!doctype html'; then
      echo "Server responded on http://127.0.0.1:${PORT}/"
      exit 0
    fi
  fi

  sleep 2
done

echo "Smoke test: app launched (PID $APP_PID) but health check timed out."
echo "Verify login manually, then quit the app."
wait "$APP_PID" || true
exit 1
