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

  # Run the application
  deno run --allow-net --allow-run index.js
else
  echo "Usage: $0 production"
fi
