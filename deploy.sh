#! /bin/bash

if [ -z $1 ]; then
  echo 'Deploying Development Profile To Local Cluster'

  npm --prefix test run dev &
  google-chrome https://localhost:5112/

  skaffold dev \
    --profile development \
    --filename ./skaffold.yaml \
    --default-repo localhost:5000 \
    --status-check=false \
    --force # forces updates to spec by replacing old objects (used so same job can be depoyed each time)
elif [ $1 = npm ]; then
  echo 'dry run:'
  (cd ./lib; npm publish --access public --dry-run)
  read -p 'Are you sure you want to deploy a new version of the @knowlearning/agents module? (y/N): ' choice
  if [ "$choice" = "y" ] || [ "$choice" = "Y" ]; then
    (cd ./lib; npm publish --access public )
  else
    echo 'NPM update deployment aborted'
    exit 1
  fi
elif [ $1 = production ]; then
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
  echo Unrecognized argument $1
fi
