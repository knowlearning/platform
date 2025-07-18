# Development

First install [docker](https://docs.docker.com/get-docker/),
[kind](https://kind.sigs.k8s.io/docs/user/quick-start), and
[skaffold](https://skaffold.dev/docs/install/); then you can:

```sh
# Run a local docker registry.
docker run -d -p 5000:5000 --restart=always --name registry registry:2

# Set up a local kind cluster and deploy the core application.
sh core/deploy.sh --setup
```
After the first run of the above command you may omit the
```--setup``` flag. Use it again any time to re-initialize the
cluster. Technically the ```sh core/deploy.sh``` script will
auto-reload servers on updates, but manually stopping it with
ctrl+c and re-running ```sh core/deploy.sh``` is often
faster.

> **_NOTE:_**<br>
> If docker/kind/something raises odd issues (we have seen
> network resolution instabilities at levels outside of this
> project's scope) just run ```sh core/deploy --setup.sh```
> again to refresh your local cluster.

# Deployment

Install [docker](https://docs.docker.com/get-docker/),
[skaffold](https://skaffold.dev/docs/install/), and
[gcloud](https://cloud.google.com/sdk/docs/install).

## GKE cluster

### Login

Use these commands to load required credentials into your
environment:

```sh
gcloud auth revoke
gcloud auth login web
gcloud config set project opensourcelearningplatform
gcloud container clusters get-credentials skaffold-deployed --region us-central1
```

Use these commands to switch kubectl to use the live project's
cluster:

```sh
kubectl config use-context gke_opensourcelearningplatform_us-central1_skaffold-deployed
kubectl config use-namespace production
```

### Deploy

#### Setup

```sh
# Install the gcloud gke-gcloud-auth-plugin component.
gcloud components install gke-gcloud-auth-plugin

# Load gcloud credentials.
gcloud container clusters get-credentials skaffold-deployed --region us-central1

# Set CORS config for production bucket.
gsutil cors set \
  core/infrastructure/production/CORS_CONFIG_FILE \
  gs://development-bucket-opensourcelearningplatform
```

#### Deploy to "staging" or "production"

```sh
# Deploy to GKE where $PROFILE=staging or production.
sh core/deploy.sh $PROFILE
```

# Sequence Diagram
```mermaid
sequenceDiagram
  participant Patch Client as Patch Client
  participant API Process as API Process
  participant State Process as State Process
  participant Etcd as Etcd
  participant Owner State Process as Owner State Process
  participant Tiered Storage as Tiered Storage

  Patch Client ->> API Process: patch request for ID
  API Process ->> State Process: patch request for ID
  State Process ->> Etcd: get or claim ownership
  Etcd ->> State Process: Owner State Process for ID
  State Process ->> Owner State Process: patch request for ID
  opt missing local state for ID
    Owner State Process ->> Tiered Storage: fetch last page
    Tiered Storage ->> Owner State Process: last page
    Owner State Process ->> Owner State Process: calculate ID state
  end
  Owner State Process ->> Owner State Process: apply patch to local state
  Owner State Process ->> State Process: acknowledge patch
  State Process ->> API Process: acknowledge patch
  alt subscription patch
    API Process ->> State Process: state request for SUB_ID
    State Process ->> Etcd: get or claim ownership
    Etcd ->> State Process: Owner State Process for SUB_ID
    State Process ->> Owner State Process: state request for SUB_ID
    opt missing local state for SUB_ID
      Owner State Process ->> Tiered Storage: fetch last page
      Tiered Storage ->> Owner State Process: last page
      Owner State Process ->> Owner State Process: calculate SUB_ID state
    end
    Owner State Process ->> State Process: state for SUB_ID
    State Process ->> API Process: state for SUB_ID
  else query patch
    API Process ->> Postgres DB: submit query
    Postgres DB ->> API Process: query response
  end
  API Process ->> Patch Client: acknowledge patch with side effect results
  loop while API Process interested in SUB_ID
    Owner State Process ->> State Process: SUB_ID patch
    State Process ->> API Process: SUB_ID patch
    API Process ->> Patch Client: SUB_ID patch
  end

```