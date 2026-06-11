#!/bin/sh

set -eu

PROJECT_ID="opensourcelearningplatform"

select_vm_by_number() {
  i=1
  for name in $INSTANCES; do
    printf '[%s] %s\n' "$i" "$name"
    i=$((i + 1))
  done

  printf 'Select a VM by number: '
  read CHOICE

  case "$CHOICE" in
    ''|*[!0-9]*)
      return 1
      ;;
  esac

  i=1
  for name in $INSTANCES; do
    if [ "$i" -eq "$CHOICE" ]; then
      printf '%s\n' "$name"
      return 0
    fi
    i=$((i + 1))
  done

  return 1
}

if [ ! -t 0 ]; then
  echo "Run this command from an interactive terminal." >&2
  exit 1
fi

echo "Fetching VM instances for project: $PROJECT_ID..."
INSTANCES=$(gcloud compute instances list --project="$PROJECT_ID" --format="value(name)")

if [ -z "$INSTANCES" ]; then
  echo "No instances found in project $PROJECT_ID" >&2
  exit 1
fi

if command -v fzf >/dev/null 2>&1; then
  VM_NAME="$(
    printf '%s\n' "$INSTANCES" | fzf \
      --height=15 \
      --border \
      --prompt='production-ssh> ' \
      --header='Select a production server. Enter connects; Esc cancels.' \
      --no-multi
  )" || exit 0
else
  VM_NAME="$(select_vm_by_number)" || {
    echo "Invalid selection." >&2
    exit 1
  }
fi

gcloud compute ssh "admin@$VM_NAME" --project="$PROJECT_ID"
