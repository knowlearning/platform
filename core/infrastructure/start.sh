#!/bin/bash

sudo apt install git unzip -y
curl -fsSL https://deno.land/install.sh | sh -s -- -y v2.1.4

echo "GETTING PLATFORM REPOSITORY"
git clone https://github.com/knowlearning/platform.git
cd platform
git checkout update-infrastructure

echo "SETTING ENVIRONMENT VARIABLES"
export DENO_CERT=/etc/ssl/certs/ca-certificates.crt
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

LOGFILE=~/output.log

chmod +x core/run.sh
nohup core/run.sh -- $LOGFILE >> $LOGFILE 2>&1 &
disown
