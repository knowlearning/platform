#!/bin/bash

set -euo pipefail

SERVICE_NAME="my-deno-app"
ZONES=(
  us-central1-a
  us-central1-b
  asia-southeast1-a
  europe-west3-a
  europe-west3-b
  europe-west3-a
  europe-west3-b
  europe-west3-a
  europe-west3-b
  europe-west3-a
  europe-west3-b
  europe-west3-a
  europe-west3-b
)

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  echo "Usage: $0 [server numbers | all]"
  echo "Select servers 1-13, separated by spaces or commas; omit arguments for a menu."
  echo "Logs are saved in your home directory using the current gcloud project."
  exit 0
fi

if [ "$#" -gt 0 ]; then
  selection="$*"
else
  echo "Select production servers:"
  for index in "${!ZONES[@]}"; do
    printf '%s) my-deno-instance-%s (%s)\n' "$((index + 1))" "$((index + 1))" "${ZONES[$index]}"
  done
  read -r -p "Enter server numbers (e.g. 1 3 6 or 1,3,6), or all: " selection
fi

read -r -a choices <<< "${selection//,/ }"

if [ "${choices[*]}" = "all" ]; then
  choices=(1 2 3 4 5 6 7 8 9 10 11 12 13)
fi

if [ "${#choices[@]}" -eq 0 ]; then
  echo "Select at least one server." >&2
  exit 1
fi

for choice in "${choices[@]}"; do
  case "$choice" in
    [1-9]|1[0-3]) ;;
    *)
      echo "Invalid server selection: $choice. Use numbers 1-13 or all." >&2
      exit 1
      ;;
  esac
done

timestamp=$(date +%Y-%m-%d_%H-%M-%S)
status=0

for index in "${!ZONES[@]}"; do
  if [[ " ${choices[*]} " != *" $((index + 1)) "* ]]; then
    continue
  fi

  instance_name="my-deno-instance-$((index + 1))"
  log_file="$HOME/${instance_name}-systemd-logs-${timestamp}.txt"
  echo "Downloading logs from $instance_name (${ZONES[$index]})..."

  if gcloud compute ssh "$instance_name" \
    --zone="${ZONES[$index]}" \
    --command "sudo journalctl -u ${SERVICE_NAME} --no-pager" \
    > "$log_file"; then
    echo "Saved logs to $log_file"
  else
    echo "Failed to download logs from $instance_name." >&2
    rm -f "$log_file"
    status=1
  fi
done

exit "$status"
