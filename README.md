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
title KnowLearning Core

participant SSO Provider
participant Authentication
participant Agent
participant Message Queue
participant Authorization
participant State Manager
participant Relational Mirror
participant Storage

Authorization->Message Queue:Initialize client connection
Authorization->Message Queue:Subscribe to all DOMAIN/USER/sessions\nstreams and monitor for side effects
Authorization -> Relational Mirror:resolve "DOMAIN/USER/SCOPE" to\nuuid and query DOMAIN access rule
Authorization -> Message Queue:Access Denied or JWT token authorizing\nread/download in "DOMAIN/USER/sessions"
State Manager -> Message Queue:Subscribe to all messages from all subjects with\nguaranteed in-order at least once delivery
State Manager -> Relational Mirror:Update records per\ndomain config
State Manager -> Message Queue:Detect "large" stream, notify "coordinator" that\nthis state manager instance is handling
State Manager -> Message Queue:Insert reference to storage file we will stream to
State Manager -> Message Queue:Pull all messages for the large stream
State Manager -> Storage:Stream grabbed interaction messages\nto reference file
State Manager -> Message Queue:Insert Snapshot that includes reference into stream\nwhen we have rolled up all interaction messages
State Manager -> Storage:On receipt of reference to stream\ntarget file, combine new file with\nold file for same stream
State Manager -> Message Queue:Clear message queue up to the inserted reference
Agent -> Authentication: sign me in
Authentication -> SSO Provider: redirect to SSO provider
SSO Provider -> Authentication: return OAuth code if\nsuccessful authentication
Authentication -> Agent: Encrypted OAuth code + domain
Agent -> Message Queue: Initialize client connection
Agent -> Authorization:Request Message Queue read/write access for\n"DOMAIN/USER/*" subjects (using Encryped code)
Authorization -> Agent:Access Denied or JWT token giving read/write\nauthorization for "DOMAIN/USER/*"
Agent->Message Queue:Add JWT that allows "DOMAIN/USER/*"\nread/write to connection authorization
Agent -> Message Queue: Listen to "DOMAIN/USER/sessions"
Agent -> Message Queue:Ask for token to authorize read other\n"DOMAIN/USER/SCOPE" (through\nmutation & side effect in sessions scope)
Agent -> Message Queue:Add JWT that allows "DOMAIN/USER/SCOPE"\nread access to client connection using token\nfrom "DOMAIN/USER/sessions" scope mutation\nfor subscription
Agent -> Message Queue:Subscribe to "DOMAN/USER/SCOPE" steam\n(Includes all available messages in\nMessage Queue)
Agent -> Message Queue:Request download (via mutation to sessions)
Agent->Message Queue:Request upload (via mutation to sessions)
Agent -> Storage:Download interaction file or other upload
Agent->Storage:Upload file with authorized URL
```

```mermaid
sequenceDiagram
title Message Publishing Pipeline

participant Application
participant Agent
participant Message Queue

Application -> Agent: State call for named or UUID scope
Agent -> Message Queue:Resolve DOMAIN, USER, and SCOPE to UUID\nor UUID to DOMAIN, USER, and SCOPE
Agent -> Message Queue:If UUID not set for DOMAIN, USER, and SCOPE\ntriplet, set up a stream for UUID with\n"DOMAIN.USER.SCOPE" subject
Agent -> Message Queue: Get num messages existing in UUID's stream
Agent -> Message Queue: Process messages up to num existing from last info request
Agent -> Application: state response with proxy set up to persist changes
Application -> Agent: JSON Patches representing updates to state
Agent -> Message Queue: Publish updates to "DOMAIN.USER.SCOPE" subject
```