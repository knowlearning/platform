#!/usr/bin/env sh
set -eu

docker build -t claude-code:local -f Dockerfile.claude .

IMAGE="${IMAGE:-claude-code:local}"
NAME="${NAME:-claude}"
REPO_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
WORKDIR="${WORKDIR:-/workspace}"
HOMEVOL="${HOMEVOL:-${NAME}-home}"
ALLOW_NET="${ALLOW_NET:-1}"

NET_ARGS="--network none"
if [ "$ALLOW_NET" = "1" ]; then
  NET_ARGS="--network bridge"
fi

docker volume inspect "$HOMEVOL" >/dev/null 2>&1 || docker volume create "$HOMEVOL" >/dev/null

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

exec docker run --rm -it \
  $NET_ARGS \
  --init \
  --mount "type=bind,src=$REPO_DIR,dst=$WORKDIR" \
  --mount "type=bind,src=$HOST_HOME,dst=/home/dev" \
  -w "$WORKDIR" \
  -e "HOME=/home/dev" \
  -e "TERM=${TERM:-xterm-256color}" \
  -u "$(id -u):$(id -g)" \
  $HARDEN_ARGS \
  "$IMAGE" \
  "$@"