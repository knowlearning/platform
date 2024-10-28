#!/bin/bash

script_dir=$(dirname "$(readlink -f "$0")")
cd "$script_dir"

if [ "$1" = "npm" ]; then
  echo 'dry run:'
  npm publish --access public --dry-run
  read -p 'Are you sure you want to deploy a new version of the @knowlearning/agent module? (y/N): ' choice
  if [ "$choice" = "y" ] || [ "$choice" = "Y" ]; then
    npm publish --access public
  else
    echo 'NPM update deployment aborted'
    exit 1
  fi
fi
