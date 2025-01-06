sudo apt install git unzip -y
curl -fsSL https://deno.land/install.sh | sh -s -- -y v2.1.4

echo "GETTING PLATFORM REPOSITORY"
git clone https://github.com/knowlearning/platform.git
cd platform
git checkout update-infrastructure

echo "SETTING ENVIRONMENT VARIABLES"
export AUTH_SERVICE_SECRET_KEY="$AUTH_SERVICE_SECRET_KEY"
export GCS_SERVICE_ACCOUNT_CREDENTIALS="$GCS_SERVICE_ACCOUNT_CREDENTIALS"
export OAUTH_CREDENTIALS="$OAUTH_CREDENTIALS"
export POSTGRES_PASSWORD="$POSTGRES_PASSWORD"
export REDIS_PASSWORD="$REDIS_PASSWORD"
export GCS_BUCKET_NAME=development-bucket-opensourcelearningplatform
export MODE=production
export ADMIN_DOMAIN=admin.knowlearning.systems
export GC_PROJECT_ID=opensourcelearningplatform
export POSTGRES_HOST=10.42.80.4
export POSTGRES_PORT=5432
export POSTGRES_USER=postgres
export REDIS_USER=default
export REDIS_HOST=redis-12681.c1.us-central1-2.gce.cloud.redislabs.com
export REDIS_PORT=12681
export PORT=80
export TLS_PORT=443

echo "STARTING SERVER"
sudo -E ~/.deno/bin/deno run \
    --allow-sys \
    --allow-net \
    --allow-write \
    --allow-read \
    --unstable-worker-options \
    --v8-flags=--max-old-space-size=8000 \
    --allow-env \
    ./core/source/index.js
