#!/usr/bin/env sh
set -eu

CODEX_VERSION="${CODEX_VERSION:-0.111.0}"
IMAGE="${IMAGE:-codex:local}"
NAME="${NAME:-codex}"
REPO_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
WORKDIR="${WORKDIR:-/workspace}"
ALLOW_NET="${ALLOW_NET:-1}"
MODEL="${MODEL:-gpt-5.4}"

NET_ARGS="--network none"
if [ "$ALLOW_NET" = "1" ]; then
  NET_ARGS="--network bridge"
fi

# Ensure we do NOT pass an API key; prefer interactive/device auth
unset OPENAI_API_KEY

# Hardening that tends not to break CLIs
HARDEN_ARGS="
--cap-drop ALL
--security-opt no-new-privileges
--pids-limit 512
--memory ${MEMORY:-2g}
--cpus ${CPUS:-2}
--tmpfs /tmp:rw,nosuid,nodev,size=1g
"

HOST_HOME="${HOST_HOME:-$REPO_DIR/.codex-home}"
mkdir -p "$HOST_HOME"

# Codex stores state under CODEX_HOME (defaults to ~/.codex)
CODEX_HOME_IN_CONTAINER="/home/dev/.codex"
mkdir -p "$HOST_HOME/.codex"

# Runtime Codex instructions (stored outside repo)
AGENTS_FILE="$HOST_HOME/.codex/AGENTS.md"

cat > "$AGENTS_FILE" <<'EOF'
Before taking actions that materially change approach, architecture, data shape, or irreversible state, ask briefly for confirmation.

Do not ask for permission for routine read, write, or bash operations inside this container.
EOF

docker build \
  --build-arg "CODEX_VERSION=$CODEX_VERSION" \
  -t "$IMAGE" \
  - <<'DOCKERFILE'
FROM node:22-bookworm-slim

ARG CODEX_VERSION

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates openssh-client bash \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g "@openai/codex@${CODEX_VERSION}"

WORKDIR /workspace
CMD ["codex"]
DOCKERFILE

exec docker run --rm -it \
  $NET_ARGS \
  --init \
  --name "$NAME" \
  --mount "type=bind,src=$REPO_DIR,dst=$WORKDIR" \
  --mount "type=bind,src=$HOST_HOME,dst=/home/dev" \
  -w "$WORKDIR" \
  -e "HOME=/home/dev" \
  -e "CODEX_HOME=$CODEX_HOME_IN_CONTAINER" \
  -e "TERM=${TERM:-xterm-256color}" \
  -e OPENAI_API_KEY= \
  -u "$(id -u):$(id -g)" \
  $HARDEN_ARGS \
  "$IMAGE" \
  codex \
  --model "$MODEL" \
  --dangerously-bypass-approvals-and-sandbox \
  "$@"