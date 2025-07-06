#!/bin/sh

PROJECT_ID="opensourcelearningplatform"

# Fetch list of instance names
echo "Fetching VM instances for project: $PROJECT_ID..."
INSTANCES=$(gcloud compute instances list --project="$PROJECT_ID" --format="value(name)")

if [ -z "$INSTANCES" ]; then
  echo "No instances found in project $PROJECT_ID"
  exit 1
fi

# Convert list to array-like format
i=1
for name in $INSTANCES; do
  echo "[$i] $name"
  eval "VM_$i=$name"
  i=$((i + 1))
done

# Prompt for choice
printf "Select a VM by number: "
read CHOICE

eval "VM_NAME=\$VM_$CHOICE"

if [ -z "$VM_NAME" ]; then
  echo "Invalid selection."
  exit 1
fi

# Launch SSH
gcloud compute ssh "admin@$VM_NAME" --project="$PROJECT_ID"
