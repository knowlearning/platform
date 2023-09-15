# Deployment

## Development
```sh
# install docker, kind, and skaffold

# need to run a local docker registry
docker run -d -p 5000:5000 --restart=always --name registry registry:2

# create a kind cluster with proper configuration
sh setup.sh

# deploy core application to local cluster
sh deploy.sh
```

## Live
```sh
# need to install skaffold, kubectl, gcloud, and gke-gcloud-auth-plugin
gcloud components install gke-gcloud-auth-plugin

# load credentials for gcloud
gcloud container clusters get-credentials skaffold-deployed --region us-central1

# set cors config for production bucket
gsutil cors set infrastructure/production/CORS_CONFIG_FILE gs://development-bucket-opensourcelearningplatform

# Deploy to GKE where $PROFILE is "staging" or "production"
sh deploy.sh $PROFILE
```

## GKE Kubernetes login

```sh
gcloud auth revoke
gcloud auth login web
gcloud config set project opensourcelearningplatform
gcloud container clusters get-credentials skaffold-deployed --region us-central1
```
