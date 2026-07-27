FROM node:22-bookworm-slim

ARG CODEX_VERSION=0.145.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    fontconfig \
    fonts-liberation \
    fzf \
    git \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libsqlite3-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    openssh-client \
    ripgrep \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g "@openai/codex@${CODEX_VERSION}"

USER node
ENV HOME=/home/node
ENV CODEX_HOME=/home/node/.codex
WORKDIR /workspace

ENTRYPOINT ["codex"]
