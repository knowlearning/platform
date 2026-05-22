# Development

First install [docker](https://docs.docker.com/get-docker/),

```sh
# Deploy the core application in dev mode
sh core/develop.sh
```

# Deployment

To deploy you must install
[docker](https://docs.docker.com/get-docker/) and
[gcloud](https://cloud.google.com/sdk/docs/install).

## Auth

Use these commands to load required credentials into your
environment:

```sh
gcloud auth revoke
gcloud auth login web
gcloud config set project opensourcelearningplatform
```

## Setup

```sh
# Set CORS config for production bucket.
gcloud storage buckets update \
  gs://development-bucket-opensourcelearningplatform \
  --cors-file=core/infrastructure/CORS_CONFIG_FILE
```

## Publish

Production publish reads deployment secrets from `.credentials` at the repo
parent. Storage credentials are full server maps:

```sh
POSTGRES_SERVERS='{"default":{"host":"10.50.0.2","port":5432,"user":"postgres","password":"..."}}'
REDIS_SERVERS='{"default":{"host":"redis.example.com","port":15018,"username":"default","password":"..."}}'
REDIS_SUBSCRIPTION_SERVER='default' # optional
```

```sh
bash core/infrastructure/GCP/publish production
```

# System Spec

## Client Request Loop
```mermaid
sequenceDiagram
  participant Patch Client as Patch Client
  participant API Process as API Process
  participant Domain Worker as Domain Worker
  participant State Process as State Process Cluster
  participant Postgres DB as Postgres DB

  Patch Client ->> API Process: patch request for ID
  API Process ->> Domain Worker: pre-persistence handler
  Note over Domain Worker: act as a Patch Client
  Domain Worker ->> API Process: handler result
  API Process ->> State Process: patch request for ID
  Note over State Process: Handle patch request as outlined below
  State Process ->> API Process: acknowledge patch
  Note over API Process,Postgres DB: handle core side effects from<br>sequence diagram below
  API Process ->> Postgres DB: update data mirror for domain specfied data
  API Process ->> Domain Worker: post-persistence handler
  Note over Domain Worker: act as a Patch Client
  Domain Worker ->> API Process: handler result
  API Process ->> Patch Client: acknowledge patch with<br>side effect results
  opt patch targets ID API Process subscribed to
    State Process ->> API Process: patch data
    loop for every interested Patch Client
      API Process ->> Patch Client: patch data
    end
  end
```

## Core Side Effects

```mermaid
sequenceDiagram
  participant Patch Client
  participant API Process
  participant Domain Worker
  participant State Process as State Process Cluster
  participant Postgres DB

  alt subscription patch
    API Process ->> State Process: state request for SUB_ID
    Note over State Process: Handle state request as outlined below
    State Process ->> API Process: state for SUB_ID
  else query patch
    API Process ->> Postgres DB: submit query
    Postgres DB ->> API Process: query response
  else upload/download patch
    Note over API Process: generate authorized url
  else configure domain patch
    API Process ->> Domain Worker: configure
    API Process ->> Postgres DB: configure
  else session close patch
    loop for outstanding close scripts in session
      API Process ->> Domain Worker: execute close script
      Note over Domain Worker: act as a Patch Client
    end
  end
```

## State Process Spec

### Current Spec

State requests simply return state from redis and subscribe to pub sub for the uuid associated with given state.

Patch requests simply apply the patch to the RedisJSON object for the given state uuid.

### Future Spec

```
patch or state request for ID:
  use consistent hash function on ID to get X owner processes
  if current process not an owner process, route request to one of the owner processes
  else:
    if is state request and already tracking, return state
    else, start tracking:
      ensure connections to majority of other owner processes
      if no leader for ID established:
        attempt to become leader
           use given list of owners from active consistent hash function
           contact other ID owners with call for vote with incremented election cycle index
           if more than half agree, become leader
             (keep acting as leader as long as can stay connected to majority of owners)
           if more than half share other leader:
             accept that leader
             (keep leader in memory and track ID as long as leader maintains connection)
           if less than half are reachable:
             return that I should be ignored as an owner
      if current process not leader:
        forward request to leader (if patch request, specify that should return state after patch)
        remember ID state
        start tracking ID state updates by applying future forwarded patches from leader
      else:
        if no current state calculated yet:
          attempt to sync current state from last leader
          if syncing from last leader not possible:
            pull all previous leader patch files from cold storage for patches for ID
            pull most recent ID specific patch files from cold storage
            calculate current state:
              if interaction index gap between ID specific patch files and leader patch files:
                log this issue
                treat ID specific patch file as authoritative
              if interaction patches from leader files don't agree, patches from most recent leader win
        if state request send state
        else if is patch request:
          if interaction index ahead of current state's + 1:
            respond to patching client with request to replay patches
          if interaction index below current'states + 1:
            notify client that it is out of sync
          else:
            if not out of sync:
              apply to current state
              send state to requester if specified
              send patch to all other ID owners that have expressed interest
            save patch to leader interaction patch file:
              bundle patches in bulk
              write to cold storage
              acknowledge for patching client (unless out of sync)
```
