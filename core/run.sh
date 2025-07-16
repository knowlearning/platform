#!/bin/bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

cleanup() {
  kill "$child"
  wait "$child"
  exit 0
}

sudo -E ~/.deno/bin/deno run \
    --allow-sys \
    --allow-net \
    --allow-write \
    --allow-read \
    --allow-run \
    --cert=/etc/ssl/certs/ca-certificates.crt \
    --v8-flags=--max-old-space-size=8000 \
    --allow-env \
    $SCRIPT_DIR/source/index.js 2>&1 | while IFS= read -r line; do
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] $line"
    done &
child=$!

wait "$child"
