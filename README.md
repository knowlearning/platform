# Deployment

## Development
```sh
# Install docker, kind, and skaffold.

# Run a local docker registry.
docker run -d -p 5000:5000 --restart=always --name registry registry:2

# Set up a local kind cluster and deploy the core application.
sh deploy --setup.sh

# Deploy core application to local cluster.
# This process does technically auto-reload servers on updates,
# but manually stopping it with ctrl+c and re-running deploy.sh
# is often faster.
sh deploy.sh
```

> **_NOTE:_**<br>
> If docker/kind/something raises odd issues (we have seen
> network resolution instabilities at levels outside of this
> project's scope) just run ```sh deploy --setup.sh``` again to
> refresh your local cluster.

## Live
```sh
# Install skaffold, kubectl, gcloud, and gke-gcloud-auth-plugin.
gcloud components install gke-gcloud-auth-plugin

# Load gcloud credentials.
gcloud container clusters get-credentials skaffold-deployed --region us-central1

# Set CORS config for production bucket.
gsutil cors set infrastructure/production/CORS_CONFIG_FILE gs://development-bucket-opensourcelearningplatform

# Deploy to GKE where $PROFILE=staging or production.
sh deploy.sh $PROFILE

# Use production cluster kubectrl context to explore
kubectl config use-context gke_opensourcelearningplatform_us-central1_skaffold-deployed
kubectl config use-namespace production
```

## GKE Kubernetes login

```sh
gcloud auth revoke
gcloud auth login web
gcloud config set project opensourcelearningplatform
gcloud container clusters get-credentials skaffold-deployed --region us-central1
```
