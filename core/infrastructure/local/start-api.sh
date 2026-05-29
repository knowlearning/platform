#!/bin/sh
set -eu

mode_file="${DENO_INSPECT_MODE_FILE:-/tmp/knowlearning-core-inspect-mode}"
inspect_host="${DENO_INSPECT_HOST:-0.0.0.0}"
inspect_port="${DENO_INSPECT_PORT:-9229}"

if [ "${MODE:-}" = "local" ]; then
  default_mode="${DENO_INSPECT_MODE:-inspect}"
else
  default_mode="${DENO_INSPECT_MODE:-none}"
fi

case "$default_mode" in
  inspect|inspect-wait|inspect-brk|none) ;;
  *)
    echo "Invalid DENO_INSPECT_MODE '$default_mode'; falling back to local default." >&2
    if [ "${MODE:-}" = "local" ]; then
      default_mode="inspect"
    else
      default_mode="none"
    fi
    ;;
esac

if [ -f "$mode_file" ]; then
  requested_mode="$(tr -d '[:space:]' < "$mode_file")"
else
  requested_mode="$default_mode"
fi

case "$requested_mode" in
  inspect|inspect-wait|inspect-brk|none)
    inspect_mode="$requested_mode"
    ;;
  "")
    inspect_mode="$default_mode"
    ;;
  *)
    echo "Ignoring invalid inspector mode '$requested_mode' from $mode_file." >&2
    inspect_mode="$default_mode"
    ;;
esac

case "$inspect_mode" in
  inspect)
    inspect_arg="--inspect=$inspect_host:$inspect_port"
    ;;
  inspect-wait)
    inspect_arg="--inspect-wait=$inspect_host:$inspect_port"
    ;;
  inspect-brk)
    inspect_arg="--inspect-brk=$inspect_host:$inspect_port"
    ;;
  *)
    inspect_arg=""
    ;;
esac

export DENO_INSPECT_MODE_ACTIVE="$inspect_mode"
export DENO_INSPECT_MODE_FILE="$mode_file"
export DENO_INSPECT_HOST="$inspect_host"
export DENO_INSPECT_PORT="$inspect_port"

set -- deno run
if [ -n "$inspect_arg" ]; then
  set -- "$@" "$inspect_arg"
fi
set -- "$@" \
  --config ./deno.json \
  --frozen \
  --cached-only \
  --allow-sys \
  --allow-net \
  --allow-env \
  --allow-write \
  --allow-read \
  --allow-run \
  --v8-flags=--max-old-space-size=8000 \
  ./source/index.js

exec "$@"
