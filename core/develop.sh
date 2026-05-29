#!/bin/bash

set -euo pipefail

script_dir=$(dirname "$(readlink -f "$0")")
cd "$script_dir"

if [ -z "${1:-}" ]; then
  export AUTH_SERVICE_SECRET_KEY=$(cat ../../.credentials/AUTH_SERVICE_SECRET_KEY)
  export OAUTH_CREDENTIALS=$(cat ../../.credentials/OAUTH_CREDENTIALS)
  export SSL_CERT=$(cat ../../.credentials/SSL_CERT)
  export SSL_KEY=$(cat ../../.credentials/SSL_KEY)
  export GCS_SERVICE_ACCOUNT_CREDENTIALS=$(cat ../../.credentials/GCS_SERVICE_ACCOUNT_CREDENTIALS)
  export PUBLIC_ENCRYPTION_KEY=$(cat ../../.credentials/PUBLIC_ENCRYPTION_KEY)
  export SECRET_ENCRYPTION_KEY=$(cat ../../.credentials/SECRET_ENCRYPTION_KEY)

  docker compose -f ./infrastructure/local/docker-compose.yaml down --remove-orphans
  docker compose -f ./infrastructure/local/docker-compose.yaml up --build
  wait
else
  echo Unrecognized argument $1
fi
