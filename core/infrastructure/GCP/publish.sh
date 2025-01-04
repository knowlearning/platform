#!/bin/bash

if [ "$1" = "production" ]; then
  while true; do
    # Check if gcloud is already logged in
    GCLOUD_USER=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")

    if [ -n "$GCLOUD_USER" ]; then
      echo "Gcloud is currently logged in as: $GCLOUD_USER"
      read -p "Do you want to use this user? (y/N): " RESPONSE
      RESPONSE=$(echo "$RESPONSE" | tr '[:upper:]' '[:lower:]')  # Convert to lowercase

      if [ -z "$RESPONSE" ] || [ "$RESPONSE" = "n" ] || [ "$RESPONSE" = "no" ]; then
        echo "Logging in as a different user..."
        gcloud auth application-default login
      elif [ "$RESPONSE" = "y" ] || [ "$RESPONSE" = "yes" ]; then
        break
      else
        echo "Invalid response. Please answer 'y' or 'n'."
      fi
    else
      echo "Gcloud is not logged in. Logging in now..."
      gcloud auth application-default login
    fi
  done

  # Necessary for listing out resources
  # gcloud auth application-default set-quota-project knowlearning

  INSTANCE_NAME="my-deno-instance"
  ZONE="us-central1-a"
  PROJECT="opensourcelearningplatform"

  # Deploy infrastructure
  deno run --allow-net --allow-run index.js

  export AUTH_SERVICE_SECRET_KEY="$(cat ../production/.credentials/AUTH_SERVICE_SECRET_KEY)"
  export GCS_SERVICE_ACCOUNT_CREDENTIALS="$(cat ../production/.credentials/GCS_SERVICE_ACCOUNT_CREDENTIALS)"
  export OAUTH_CREDENTIALS="$(cat ../production/.credentials/OAUTH_CREDENTIALS)"
  export POSTGRES_PASSWORD="$(cat ../production/.credentials/POSTGRES_PASSWORD)"
  export REDIS_PASSWORD="$(cat ../production/.credentials/REDIS_PASSWORD)"
  export INSECURE_DEVELOPMENT_CERT="$(cat ../production/.credentials/INSECURE_DEVELOPMENT_CERT)"
  export INSECURE_DEVELOPMENT_KEY="$(cat ../production/.credentials/INSECURE_DEVELOPMENT_KEY)"

  gcloud compute ssh admin@$INSTANCE_NAME \
    --zone=$ZONE \
    --project=$PROJECT \
    -- -o "SendEnv \
        AUTH_SERVICE_SECRET_KEY \
        GCS_SERVICE_ACCOUNT_CREDENTIALS \
        OAUTH_CREDENTIALS \
        POSTGRES_PASSWORD \
        REDIS_PASSWORD \
        INSECURE_DEVELOPMENT_CERT \
        INSECURE_DEVELOPMENT_KEY" \
      "bash -s" < ../run.sh
else
  echo "Usage: $0 production"
fi
