#! /bin/bash

script_dir=$(dirname "$(readlink -f "$0")")
cd "$script_dir"

if [ -z "$1" ] || [ "$1" = "--setup" ]; then
  if [ "$1" = "--setup" ]; then
    echo 'Setting Up Development Cluster'
    echo 'Removing Old Development Cluster (If Exists)'
    kind delete clusters kl-core
    kind create cluster --config ../core/infrastructure/development/cluster.yaml
  fi

  echo 'Deploying Development Profile To Local Cluster'

  npm --prefix ../sites/test     run dev &
  npm --prefix ../sites/admin    run dev &
  npm --prefix ../sites/embed    run dev &
  npm --prefix ../sites/sequence run dev &

  skaffold dev \
    --profile development \
    --filename ./skaffold.yaml \
    --default-repo localhost:5000 \
    --kube-context=kind-kl-core \
    --status-check=false \
    --force # forces updates to spec by replacing old objects (used so same job can be depoyed each time)
elif [ $1 = npm ]; then
  echo 'dry run:'
  (cd ../packages/agents; npm publish --access public --dry-run)
  read -p 'Are you sure you want to deploy a new version of the @knowlearning/agents module? (y/N): ' choice
  if [ "$choice" = "y" ] || [ "$choice" = "Y" ]; then
    (cd ../packages/agents; npm publish --access public)
  else
    echo 'NPM update deployment aborted'
    exit 1
  fi
elif [ $1 = staging ]; then
  read -p 'Are you sure you want to deploy to STAGING? (y/N): ' choice
  if [ "$choice" = "y" ] || [ "$choice" = "Y" ]; then
    echo 'Deploying To Live Staging Cluster'
    # old job must be removed before adding new one
    KUBE_CONTEXT=gke_opensourcelearningplatform_us-central1_skaffold-deployed
    skaffold run \
      --profile staging \
      --filename ./skaffold.yaml \
      --kube-context=$KUBE_CONTEXT \
      --default-repo=gcr.io/opensourcelearningplatform
    echo 'Done!'
  else
    echo 'Deployment aborted'
    exit 1
  fi
elif [ $1 = production ]; then
  current_branch=$(git rev-parse --abbrev-ref HEAD)

  if [ "$current_branch" = "trunk" ]; then
    read -p 'Are you sure you want to deploy to PRODUCTION? (y/N): ' choice
    if [ "$choice" = "y" ] || [ "$choice" = "Y" ]; then
      echo 'Deploying To Live Production Cluster'
      # old job must be removed before adding new one
      KUBE_CONTEXT=gke_opensourcelearningplatform_us-central1_skaffold-deployed
      skaffold run \
        --profile production \
        --filename ./skaffold.yaml \
        --kube-context=$KUBE_CONTEXT \
        --default-repo=gcr.io/opensourcelearningplatform
      echo 'Done!'
    else
      echo 'Deployment aborted'
      exit 1
    fi
  else
      echo "Must be on trunk branch to deploy to production.\nCurrent branch: $current_branch"
  fi
else
  echo Unrecognized argument $1
fi
