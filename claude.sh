#!/usr/bin/env sh
set -eu

IMAGE="${IMAGE:-claude-code:local}"
NAME="${NAME:-claude}"
REPO_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
WORKDIR="${WORKDIR:-/workspace}"
ALLOW_NET="${ALLOW_NET:-1}"

NET_ARGS="--network none"
if [ "$ALLOW_NET" = "1" ]; then
  NET_ARGS="--network bridge"
fi

# Ensure we do NOT pass an API key; force interactive/device auth
unset ANTHROPIC_API_KEY

# Hardening that tends not to break CLIs
HARDEN_ARGS="
--cap-drop ALL
--security-opt no-new-privileges
--pids-limit 512
--memory ${MEMORY:-2g}
--cpus ${CPUS:-2}
--tmpfs /tmp:rw,nosuid,nodev,size=1g
"

HOST_HOME="${HOST_HOME:-$REPO_DIR/.claude-home}"
mkdir -p "$HOST_HOME"

docker build -t "$IMAGE" - <<'DOCKERFILE'
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates openssh-client bash \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /workspace
CMD ["claude"]
DOCKERFILE

exec docker run --rm -it \
  $NET_ARGS \
  --init \
  --mount "type=bind,src=$REPO_DIR,dst=$WORKDIR" \
  --mount "type=bind,src=$HOST_HOME,dst=/home/dev" \
  -w "$WORKDIR" \
  -e "HOME=/home/dev" \
  -e "TERM=${TERM:-xterm-256color}" \
  -e ANTHROPIC_API_KEY= \
  -u "$(id -u):$(id -g)" \
  $HARDEN_ARGS \
  "$IMAGE" \
  "$@"