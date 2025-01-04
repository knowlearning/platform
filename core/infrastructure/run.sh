sudo apt install git unzip -y
curl -fsSL https://deno.land/install.sh | sh -s -- -y

git clone https://github.com/knowlearning/platform.git

git checkout -b update-infrastructure

echo "SETTING ENVIRONMENT VARIABLES"
GCS_BUCKET_NAME=development-bucket-opensourcelearningplatform
MODE=production
ADMIN_DOMAIN=admin.knowlearning.systems
GC_PROJECT_ID=opensourcelearningplatform
POSTGRES_HOST=10.42.80.4
POSTGRES_PORT=5432
POSTGRES_USER=postgres
REDIS_USER=default
REDIS_HOST=redis-12681.c1.us-central1-2.gce.cloud.redislabs.com
REDIS_PORT=12681
PORT=80
TLS_PORT=443

echo "STARTING SERVER"
AUTH_SERVICE_SECRET_KEY="$AUTH_SERVICE_SECRET_KEY" \
GCS_SERVICE_ACCOUNT_CREDENTIALS="$GCS_SERVICE_ACCOUNT_CREDENTIALS" \
OAUTH_CREDENTIALS="$OAUTH_CREDENTIALS" \
POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
REDIS_PASSWORD="$REDIS_PASSWORD" \
GCS_BUCKET_NAME="$GCS_BUCKET_NAME" \
MODE="$MODE" \
ADMIN_DOMAIN="$ADMIN_DOMAIN" \
GC_PROJECT_ID="$GC_PROJECT_ID" \
POSTGRES_HOST="$POSTGRES_HOST" \
POSTGRES_PORT="$POSTGRES_PORT" \
POSTGRES_USER="$POSTGRES_USER" \
REDIS_USER="$REDIS_USER" \
REDIS_HOST="$REDIS_HOST" \
REDIS_PORT="$REDIS_PORT" \
PORT="$PORT" \
TLS_PORT="$TLS_PORT" \
INSECURE_DEVELOPMENT_CERT="$INSECURE_DEVELOPMENT_CERT" \
INSECURE_DEVELOPMENT_KEY="$INSECURE_DEVELOPMENT_KEY" \
~/.deno/bin/deno run \
  --allow-sys \
  --allow-net \
  --allow-write \
  --allow-read \
  --unstable-worker-options \
  --v8-flags=--max-old-space-size=8000 \
  --allow-env \
  ./platform/core/source/index.js
