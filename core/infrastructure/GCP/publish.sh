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
        echo "Continuing with the current user: $GCLOUD_USER"
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
  PROJECT="knowlearning"

  # Deploy infrastructure
  deno run --allow-net --allow-run index.js

  # Make sure the instance exists and is running
  echo "Waiting for $INSTANCE_NAME to be RUNNING..."
  while true; do
    STATUS=$(gcloud compute instances describe "$INSTANCE_NAME" \
             --project="$PROJECT" \
             --zone="$ZONE" \
             --format='get(status)' 2>/dev/null)
    if [ "$STATUS" = "RUNNING" ]; then
      echo "Instance is RUNNING!"
      break
    else
      echo "Current status: $STATUS. Waiting..."
      sleep 1
    fi
  done

  # Share credentials with instance
  gcloud compute scp --recurse ../production/.credentials \
    admin@$INSTANCE_NAME:/home/admin \
    --zone=$ZONE \
    --project=$PROJECT
else
  echo "Usage: $0 production"
fi
