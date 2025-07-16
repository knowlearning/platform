#!/bin/bash

set -euo pipefail

sudo apt update
sudo apt install git unzip -y
curl -fsSL https://deno.land/install.sh | sh -s -- -y v2.2.7

# allow deno binary to bind to low ports
sudo setcap 'cap_net_bind_service=+ep' $HOME/.deno/bin/deno

echo "GETTING PLATFORM REPOSITORY"
git clone https://github.com/knowlearning/platform.git
cd platform
git checkout trunk

SERVICE_NAME="my-deno-app"
USER_NAME="$(whoami)"
DENO_BIN="$HOME/.deno/bin/deno"
APP_PATH="$HOME/platform/core/source/index.js"
LOG_PATH="$HOME/output.log"
CERT_PATH="/etc/ssl/certs/ca-certificates.crt"

# 1. Write the systemd service file
sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" > /dev/null <<EOF
[Unit]
Description=My Deno App
After=network.target

[Service]
ExecStart=${DENO_BIN} run \\
  --allow-sys \\
  --allow-net \\
  --allow-write \\
  --allow-read \\
  --allow-run \\
  --cert=${CERT_PATH} \\
  --v8-flags=--max-old-space-size=8000 \\
  --allow-env \\
  ${APP_PATH}
WorkingDirectory=${HOME}
Restart=always
RestartSec=3
StandardOutput=append:${LOG_PATH}
StandardError=append:${LOG_PATH}
User=${USER_NAME}
Environment=AUTH_SERVICE_SECRET_KEY
Environment=GCS_SERVICE_ACCOUNT_CREDENTIALS
Environment=OAUTH_CREDENTIALS
Environment=POSTGRES_PASSWORD
Environment=REDIS_PASSWORD
Environment=PUBLIC_ENCRYPTION_KEY
Environment=SECRET_ENCRYPTION_KEY
Environment=GCS_BUCKET_NAME
Environment=MODE
Environment=ADMIN_DOMAIN
Environment=GC_PROJECT_ID
Environment=POSTGRES_HOST
Environment=POSTGRES_PORT
Environment=POSTGRES_USER
Environment=REDIS_USER
Environment=REDIS_HOST
Environment=REDIS_PORT
Environment=PORT
Environment=TLS_PORT

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}"
sudo systemctl set-environment \
  AUTH_SERVICE_SECRET_KEY="$AUTH_SERVICE_SECRET_KEY" \
  GCS_SERVICE_ACCOUNT_CREDENTIALS="$GCS_SERVICE_ACCOUNT_CREDENTIALS" \
  OAUTH_CREDENTIALS="$OAUTH_CREDENTIALS" \
  POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  REDIS_PASSWORD="$REDIS_PASSWORD" \
  PUBLIC_ENCRYPTION_KEY="$PUBLIC_ENCRYPTION_KEY" \
  SECRET_ENCRYPTION_KEY="$SECRET_ENCRYPTION_KEY" \
  GCS_BUCKET_NAME=development-bucket-opensourcelearningplatform \
  MODE=production \
  ADMIN_DOMAIN=admin.knowlearning.systems \
  GC_PROJECT_ID=opensourcelearningplatform \
  POSTGRES_HOST=10.42.80.4 \
  POSTGRES_PORT=5432 \
  POSTGRES_USER=postgres \
  REDIS_USER=default \
  REDIS_HOST=redis-12681.c1.us-central1-2.gce.cloud.redislabs.com \
  REDIS_PORT=12681 \
  PORT=80 \
  TLS_PORT=443

sudo systemctl start "${SERVICE_NAME}"
sudo systemctl status "${SERVICE_NAME}" --no-pager
