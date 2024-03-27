#!/bin/bash


# TODO: guided install for docker, kind, and skaffold

# make scripts executable
script_dir=$(dirname "$(readlink -f "$0")")
cd "$script_dir"

chmod +x deploy.sh
chmod +x update.sh