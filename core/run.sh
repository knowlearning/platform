#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Keep the server running and auto-restart on exit
while true; do
    echo "$(date): Starting service..." >> $1
    sudo -E ~/.deno/bin/deno run \
        --allow-sys \
        --allow-net \
        --allow-write \
        --allow-read \
        --unstable-worker-options \
        --cert=/etc/ssl/certs/ca-certificates.crt \
        --v8-flags=--max-old-space-size=8000 \
        --allow-env \
        $SCRIPT_DIR/source/index.js
    EXIT_STATUS=$?
    echo "$(date): Service exited with status $EXIT_STATUS. Restarting in 2 seconds..." >> "$1"
    sleep 2
done
