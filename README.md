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

```mermaid
sequenceDiagram

  participant OAuth SSO Provider
  participant auth.knowlearning.systems
  actor DOMAIN application
  participant Browser Agent
  participant NATS Cluster
  participant Authorization

  Authorizer ->> NATS Cluster: subscribe to $SYS.REQ.ACCOUNT.*.CLAIMS.LOOKUP
  DOMAIN application ->> Browser Agent: login(PROVIDER)
  activate Browser Agent
  Browser Agent ->> Browser Agent: save window.location.path<br>to localStorage as ORIGINAL_PATH
  Browser Agent ->> auth.knowlearning.systems: Initiate login by directing browser to<br>https://auth.knowlearning.systems/[PROVIDER]/[STATE]
  deactivate Browser Agent
  activate auth.knowlearning.systems
  auth.knowlearning.systems ->>+OAuth SSO Provider: Construct OAuth 2.0 request for PROVIDER
  deactivate auth.knowlearning.systems
  OAuth SSO Provider -->>-auth.knowlearning.systems: Send OAuth 2 Code on auth success
  activate auth.knowlearning.systems
  auth.knowlearning.systems ->> auth.knowlearning.systems: create ENCRYPTED_TOKEN using<br>public key from Authorization server
  auth.knowlearning.systems -->> Browser Agent: Open Browser agent at https://DOMAIN/auth/STATE/ENCRYPTED_TOKEN
  deactivate auth.knowlearning.systems
  activate Browser Agent
  Browser Agent ->> Browser Agent: Save ENCRYPTED_TOKEN<br>into localStorage for DOMAIN
  Browser Agent ->> DOMAIN application: Open https://DOMAIN/ORIGINAL_PATH
  deactivate Browser Agent
  activate DOMAIN application
  activate Authorization
  DOMAIN application ->> Browser Agent: load agent script
  activate Browser Agent
  alt "token" in localStorage
    Browser Agent ->> Browser Agent: Remove ENCRYPTED_TOKEN from<br>localStorage
    Browser Agent ->> Authorization: fetch NATS_CREDENTIAL with ENCRYPTED_TOKEN<br>to establish new session
    Authorization ->> Authorization: Decrypt<br>ENCRYPTED_TOKEN<br>with secret key
    Authorization ->> OAuth SSO Provider: Use OAuth SSO Provider token uri to supply code in exchage for token
    OAuth SSO Provider -->> Authorization: JSON Web Token (JWT) response
    Authorization ->> Authorization: Validate JWT and associate<br>user with new Session Cookie
    Authorization ->> NATS Cluster: Associate new NATS_CREDENTIAL with OAUTH user<br>(allows writing and reading DOMAIN.USER.>)
    Authorization -->> Browser Agent: NATS_CREDENTIAL and matching Session Cookie
  else no "token" in localStorage
    Browser Agent ->> Authorization: fetch NATS_CREDENTIAL relying on "session" cookie
    alt existing session cookie
      Authorization -->> Browser Agent: NATS_CREDENTIAL for Session Cookie
    else no existing session cookie
      Authorization -->> Browser Agent: NATS_CREDENTIAL and matching Session Cookie for new anonymous user
    end
  end
  deactivate Authorization
  activate NATS Cluster
  Browser Agent ->> NATS Cluster: Create connection with NATS_CREDENTIAL
  NATS Cluster -->> Authorizer: $SYS.REQ.ACCOUNT.*.CLAIMS.LOOKUP message
  activate Authorizer
  Authorizer ->> NATS Cluster: $SYS.REQ.ACCOUNT.*.CLAIMS.LOOKUP message response
  deactivate Authorizer
  NATS Cluster -->> Browser Agent: Connection Established
  opt watch SCOPE
    DOMAIN application ->> Browser Agent: call watch() or state()
    alt SCOPE owned by other user
      Browser Agent ->> Authorization: request authorization
      alt Authorization successful
        Authorization ->> NATS Cluster: add read permission for NATS_CREDENTIAL<br>by publishing to $SYS.REQ.CLAIMS.UPDATE
        Authorization -->> Browser Agent: Authorized response
      else Authorization unsuccessful
        Authorization -->> Browser Agent: Unauthorized response
      end
    end
    break if authorization failed
      Browser Agent -->> DOMAIN application: throw unauthorized error
    end
    Browser Agent ->> NATS Cluster: Request all messages on stream for scope
    loop message available
        NATS Cluster -->> Browser Agent: next message
        alt seq < STREAM_SIZE
          Browser Agent ->> Browser Agent: store as message history
        else seq = STREAM_SIZE
          Browser Agent -->> DOMAIN application: Compute current state and resolve promise with state and history
        else seq > STREAM_SIZE
          Browser Agent ->> DOMAIN application: Call callback with updated state and patch info
        end
    end
  end
  deactivate Browser Agent
  deactivate DOMAIN application
  deactivate NATS Cluster
```