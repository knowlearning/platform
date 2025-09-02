#!/bin/bash

  while true; do
    # Check if gcloud is already logged in
    GCLOUD_USER=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")

    if [ -n "$GCLOUD_USER" ]; then
      echo "gcloud authed as: $GCLOUD_USER"
      read -p "use this account? (y/N): " RESPONSE
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

  # Deploy infrastructure

  export PROJECT="opensourcelearningplatform"

  echo "Select an environment:"
  echo "1) us-a"
  echo "2) us-b"
  echo "3) asia"

  read -p "Enter choice [1-3]: " choice

  case "$choice" in
    1)
      export REGION="us-central1"
      export ZONE="us-central1-a"
      export INSTANCE_NAME="my-deno-instance-1"
      export STATIC_IP_NAME="my-static-ip-1"
      ;;
    2)
      export REGION="us-central1"
      export ZONE="us-central1-b"
      export INSTANCE_NAME="my-deno-instance-2"
      export STATIC_IP_NAME="my-static-ip-2"
      ;;
    3)
      export REGION="asia-southeast1"
      export ZONE="asia-southeast1-a"
      export INSTANCE_NAME="my-deno-instance-3"
      export STATIC_IP_NAME="my-static-ip-3"
      ;;
    *)
      echo "Invalid choice"
      exit 1
      ;;
  esac




  export GCP_MACHINE="n4-standard-2"

  deno run --allow-net --allow-run --allow-env index.js

  export AUTH_SERVICE_SECRET_KEY="$(cat ../.credentials/AUTH_SERVICE_SECRET_KEY)"
  export GCS_SERVICE_ACCOUNT_CREDENTIALS="$(cat ../.credentials/GCS_SERVICE_ACCOUNT_CREDENTIALS)"
  export OAUTH_CREDENTIALS="$(cat ../.credentials/OAUTH_CREDENTIALS)"
  export POSTGRES_PASSWORD="$(cat ../.credentials/POSTGRES_PASSWORD)"
  export REDIS_PASSWORD="$(cat ../.credentials/REDIS_PASSWORD)"
  export SSL_CERT="$(cat ../.credentials/SSL_CERT)"
  export SSL_KEY="$(cat ../.credentials/SSL_KEY)"
  export PUBLIC_ENCRYPTION_KEY="$(cat ../.credentials/PUBLIC_ENCRYPTION_KEY)"
  export SECRET_ENCRYPTION_KEY="$(cat ../.credentials/SECRET_ENCRYPTION_KEY)"

  while true; do
    gcloud compute ssh admin@$INSTANCE_NAME \
      --zone=$ZONE \
      --project=$PROJECT \
      -- -o "SendEnv \
          AUTH_SERVICE_SECRET_KEY \
          GCS_SERVICE_ACCOUNT_CREDENTIALS \
          OAUTH_CREDENTIALS \
          POSTGRES_PASSWORD \
          REDIS_PASSWORD \
          PUBLIC_ENCRYPTION_KEY \
          SECRET_ENCRYPTION_KEY \
          SSL_CERT \
          SSL_KEY" \
      "bash -s" < ../start.sh && break
    echo "Retrying in 3 seconds..."
    sleep 3
  done
