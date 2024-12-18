sudo apt install unzip
curl -fsSL https://deno.land/install.sh | sh -s -- -y

echo "SETTING ENVIRONMENT VARIABLES"

AUTH_SERVICE_SECRET_KEY=$(gcloud secrets versions access latest --secret=AUTH_SERVICE_SECRET_KEY)
GCS_SERVICE_ACCOUNT_CREDENTIALS=$(gcloud secrets versions access latest --secret=GCS_SERVICE_ACCOUNT_CREDENTIALS)
OAUTH_CREDENTIALS=$(gcloud secrets versions access latest --secret=OAUTH_CREDENTIALS)
POSTGRES_PASSWORD=$(gcloud secrets versions access latest --secret=POSTGRES_PASSWORD)
REDIS_PASSWORD=$(gcloud secrets versions access latest --secret=REDIS_PASSWORD)
GCS_BUCKET_NAME=development-bucket-opensourcelearningplatform
MODE=production
GC_PROJECT_ID=opensourcelearningplatform
POSTGRES_HOST=10.42.80.4
POSTGRES_PORT=5432
POSTGRES_USER=postgres
REDIS_USER=default
REDIS_HOST=redis-12681.c1.us-central1-2.gce.cloud.redislabs.com
REDIS_PORT=12681
PORT=80

echo "STARTING SERVER"

AUTH_SERVICE_SECRET_KEY="$AUTH_SERVICE_SECRET_KEY" \
GCS_SERVICE_ACCOUNT_CREDENTIALS="$GCS_SERVICE_ACCOUNT_CREDENTIALS" \
OAUTH_CREDENTIALS="$OAUTH_CREDENTIALS" \
POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
REDIS_PASSWORD="$REDIS_PASSWORD" \
GCS_BUCKET_NAME="$GCS_BUCKET_NAME" \
MODE="$MODE" \
GC_PROJECT_ID="$GC_PROJECT_ID" \
POSTGRES_HOST="$POSTGRES_HOST" \
POSTGRES_PORT="$POSTGRES_PORT" \
POSTGRES_USER="$POSTGRES_USER" \
REDIS_USER="$REDIS_USER" \
REDIS_HOST="$REDIS_HOST" \
REDIS_PORT="$REDIS_PORT" \
PORT="$PORT" \
/root/.deno/bin/deno run \
  --allow-sys \
  --allow-net \
  --allow-write \
  --allow-read \
  --unstable-worker-options \
  --v8-flags=--max-old-space-size=8000 \
  --allow-env \
  ./source/index.js
