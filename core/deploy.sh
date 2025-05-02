#!/bin/bash

script_dir=$(dirname "$(readlink -f "$0")")
cd "$script_dir"

if [ -z "$1" ]; then
  export AUTH_SERVICE_SECRET_KEY=$(cat ./infrastructure/local/.credentials/AUTH_SERVICE_SECRET_KEY)
  export OAUTH_CREDENTIALS=$(cat ./infrastructure/local/.credentials/OAUTH_CREDENTIALS)
  export SSL_CERT=$(cat ./infrastructure/local/.credentials/SSL_CERT)
  export SSL_KEY=$(cat ./infrastructure/local/.credentials/SSL_KEY)
  export GCS_SERVICE_ACCOUNT_CREDENTIALS=$(cat ./infrastructure/local/.credentials/GCS_SERVICE_ACCOUNT_CREDENTIALS)
  export PUBLIC_ENCRYPTION_KEY=$(cat ./infrastructure/local/.credentials/PUBLIC_ENCRYPTION_KEY)
  export SECRET_ENCRYPTION_KEY=$(cat ./infrastructure/local/.credentials/SECRET_ENCRYPTION_KEY)

  docker compose -f ./infrastructure/local/docker-compose.yaml down
  docker compose -f ./infrastructure/local/docker-compose.yaml up --build
  wait
else
  echo Unrecognized argument $1
fi
