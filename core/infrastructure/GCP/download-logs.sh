SERVICE_NAME="my-deno-app"

gcloud compute ssh my-deno-instance-1 \
  --command "sudo journalctl -u ${SERVICE_NAME} --no-pager" \
  > ~/my-deno-instance-1-systemd-logs-$(date +%Y-%m-%d_%H-%M-%S).txt