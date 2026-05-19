#!/bin/bash

set -euo pipefail

# enable swap space
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

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
CORE_PATH="$HOME/platform/core"
APP_PATH="$CORE_PATH/source/index.js"
DOMAIN_WORKER_PATH="$CORE_PATH/source/domain-worker/index.js"
CONFIG_PATH="$CORE_PATH/deno.json"
CERT_PATH="/etc/ssl/certs/ca-certificates.crt"

cd "$CORE_PATH"
"$DENO_BIN" install --frozen --entrypoint "$APP_PATH" "$DOMAIN_WORKER_PATH"

# 1. Write the systemd service file
sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" > /dev/null <<EOF
[Unit]
Description=My Deno App
After=network.target

[Service]
ExecStart=${DENO_BIN} run \\
  --inspect=127.0.0.1:9229 \\
  --config=${CONFIG_PATH} \\
  --frozen \\
  --cached-only \\
  --allow-sys \\
  --allow-net \\
  --allow-write \\
  --allow-read \\
  --allow-run \\
  --cert=${CERT_PATH} \\
  --allow-env \\
  ${APP_PATH}
WorkingDirectory=${CORE_PATH}
Restart=always
RestartSec=1
User=${USER_NAME}
MemoryMax=8G
MemoryHigh=6G
Environment=AUTH_SERVICE_SECRET_KEY
Environment=GCS_SERVICE_ACCOUNT_CREDENTIALS
Environment=OAUTH_CREDENTIALS
Environment=POSTGRES_SERVERS
Environment=REDIS_SERVERS
Environment=PUBLIC_ENCRYPTION_KEY
Environment=SECRET_ENCRYPTION_KEY
Environment=GCS_BUCKET_NAME
Environment=MODE
Environment=ADMIN_DOMAIN
Environment=GC_PROJECT_ID
Environment=PORT
Environment=TLS_PORT
Environment=SSL_CERT
Environment=SSL_KEY

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}"

# Escape password values before interpolating them into JSON environment values.
# This preserves valid REDIS_SERVERS/POSTGRES_SERVERS JSON when passwords contain " or \.
REDIS_PASSWORD_JSON=${REDIS_PASSWORD//\\/\\\\}
REDIS_PASSWORD_JSON=${REDIS_PASSWORD_JSON//\"/\\\"}
POSTGRES_PASSWORD_JSON=${POSTGRES_PASSWORD//\\/\\\\}
POSTGRES_PASSWORD_JSON=${POSTGRES_PASSWORD_JSON//\"/\\\"}

sudo systemctl set-environment \
  AUTH_SERVICE_SECRET_KEY="$AUTH_SERVICE_SECRET_KEY" \
  GCS_SERVICE_ACCOUNT_CREDENTIALS="$GCS_SERVICE_ACCOUNT_CREDENTIALS" \
  OAUTH_CREDENTIALS="$OAUTH_CREDENTIALS" \
  POSTGRES_SERVERS="{\"default\":{\"host\":\"10.50.0.2\",\"port\":5432,\"user\":\"postgres\",\"password\":\"$POSTGRES_PASSWORD_JSON\"}}" \
  REDIS_SERVERS="{\"default\":{\"host\":\"redis-15018.fcrce259.eu-central-1-3.ec2.cloud.redislabs.com\",\"port\":15018,\"username\":\"default\",\"password\":\"$REDIS_PASSWORD_JSON\"}}" \
  PUBLIC_ENCRYPTION_KEY="$PUBLIC_ENCRYPTION_KEY" \
  SECRET_ENCRYPTION_KEY="$SECRET_ENCRYPTION_KEY" \
  SSL_CERT="$SSL_CERT"\
  SSL_KEY="$SSL_KEY"\
  GCS_BUCKET_NAME=development-bucket-opensourcelearningplatform \
  MODE=production \
  ADMIN_DOMAIN=admin.knowlearning.systems \
  GC_PROJECT_ID=opensourcelearningplatform \
  PORT=80 \
  TLS_PORT=443

sudo systemctl start "${SERVICE_NAME}"
sudo systemctl status "${SERVICE_NAME}" --no-pager
