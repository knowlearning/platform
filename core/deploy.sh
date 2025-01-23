#!/bin/bash

script_dir=$(dirname "$(readlink -f "$0")")
cd "$script_dir"

if [ -z "$1" ]; then
  export AUTH_SERVICE_SECRET_KEY=$(cat ./infrastructure/development/.credentials/AUTH_SERVICE_SECRET_KEY)
  export OAUTH_CREDENTIALS=$(cat ./infrastructure/development/.credentials/OAUTH_CREDENTIALS)
  export INSECURE_DEVELOPMENT_CERT=$(cat ./infrastructure/development/.credentials/INSECURE_DEVELOPMENT_CERT)
  export INSECURE_DEVELOPMENT_KEY=$(cat ./infrastructure/development/.credentials/INSECURE_DEVELOPMENT_KEY)

  docker compose -f ./infrastructure/local/docker-compose.yaml down
  docker compose -f ./infrastructure/local/docker-compose.yaml up --build
  wait
else
  echo Unrecognized argument $1
fi
