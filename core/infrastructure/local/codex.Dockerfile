FROM node:22-bookworm-slim

ARG CODEX_VERSION=0.135.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    fzf \
    git \
    openssh-client \
    ripgrep \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g "@openai/codex@${CODEX_VERSION}"

USER node
ENV HOME=/home/node
ENV CODEX_HOME=/home/node/.codex
WORKDIR /workspace

ENTRYPOINT ["codex"]
