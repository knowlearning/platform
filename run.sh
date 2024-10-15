sudo apt install unzip
curl -fsSL https://deno.land/install.sh | sh -s -- -y

mv ./packages/agent ./core2/source/authorization/agent

AUTH_SERVICE_SECRET_KEY=$(gcloud secrets versions access latest --secret=AUTH_SERVICE_SECRET_KEY)
GCS_SERVICE_ACCOUNT_CREDENTIALS=$(gcloud secrets versions access latest --secret=GCS_SERVICE_ACCOUNT_CREDENTIALS)
OAUTH_CREDENTIALS=$(gcloud secrets versions access latest --secret=OAUTH_CREDENTIALS)
POSTGRES_PASSWORD=$(gcloud secrets versions access latest --secret=POSTGRES_PASSWORD)
REDIS_PASSWORD=$(gcloud secrets versions access latest --secret=REDIS_PASSWORD)
NATS_AUTH_USER_NKEY_PRIVATE=$(gcloud secrets versions access latest --secret=NATS_AUTH_USER_NKEY_PRIVATE)
NATS_ISSUER_NKEY_PRIVATE=$(gcloud secrets versions access latest --secret=NATS_ISSUER_NKEY_PRIVATE)

NATS_AUTH_USER_NKEY_PUBLIC=UAKEFMDW6OPGHW3AO5SXYTQHJTIVS5SZZ6ORRBD64W7IR45WC3I7RJZX
NATS_ISSUER_NKEY_PUBLIC=AAAIXC6E5E362GCLVP3TJRLUNJ4NM5MXYWIKEZ3KVHFA7R35L5VXTK62
NATS_CLUSTER_HOST=nats://35.226.122.224:4222
GCS_BUCKET_NAME=local-gcs-bucket
MODE=production
GC_PROJECT_ID=opensourcelearningplatform
POSTGRES_HOST=10.128.15.205
POSTGRES_PORT=5432
POSTGRES_USER=postgres
REDIS_USER=default
REDIS_HOST=10.128.0.26
REDIS_PORT=6379

AUTH_SERVICE_SECRET_KEY="$AUTH_SERVICE_SECRET_KEY" \
GCS_SERVICE_ACCOUNT_CREDENTIALS="$GCS_SERVICE_ACCOUNT_CREDENTIALS" \
OAUTH_CREDENTIALS="$OAUTH_CREDENTIALS" \
POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
REDIS_PASSWORD="$REDIS_PASSWORD" \
NATS_AUTH_USER_NKEY_PRIVATE="$NATS_AUTH_USER_NKEY_PRIVATE" \
NATS_ISSUER_NKEY_PRIVATE="$NATS_ISSUER_NKEY_PRIVATE" \
NATS_AUTH_USER_NKEY_PUBLIC="$NATS_AUTH_USER_NKEY_PUBLIC" \
NATS_ISSUER_NKEY_PUBLIC="$NATS_ISSUER_NKEY_PUBLIC" \
NATS_CLUSTER_HOST="$NATS_CLUSTER_HOST" \
GCS_BUCKET_NAME="$GCS_BUCKET_NAME" \
MODE="$MODE" \
GC_PROJECT_ID="$GC_PROJECT_ID" \
POSTGRES_HOST="$POSTGRES_HOST" \
POSTGRES_PORT="$POSTGRES_PORT" \
POSTGRES_USER="$POSTGRES_USER" \
REDIS_USER="$REDIS_USER" \
REDIS_HOST="$REDIS_HOST" \
REDIS_PORT="$REDIS_PORT" \
/home/admin/.deno/bin/deno run \
  --allow-sys \
  --allow-net \
  --allow-write \
  --allow-read \
  --unstable-worker-options \
  --v8-flags=--max-old-space-size=8000 \
  --allow-env \
  ./core2/source/authorization/index.js
