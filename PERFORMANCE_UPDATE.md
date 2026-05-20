# Performance Investigation Update

Date: 2026-05-20

This note captures the current test-suite latency investigation so the project can be resumed without reconstructing the thread.

## Current Workspace State

- The API process has been restarted back onto the original core implementation.
- Temporary core/server/client instrumentation and A/B implementation swaps were reverted.
- The only remaining performance-related working-tree additions are the latency probe:
  - `test/package.json`: adds `npm run test:latency`.
  - `test/latency-probe.js`: Vite-builds and runs the probe entry.
  - `test/latency-probe.entry.js`: measures raw API, Agent environment/state/mutation, synced, and watch delivery timings.
- Run performance probe from the test package:

```sh
cd /workspace/test
LATENCY_SAMPLES=20 npm run test:latency
```

- Restart one API server after temporary core edits:

```sh
cd /workspace/test
node dev-api-control.js restart api-1:8765
```

## Baseline Latency Shape

Representative baseline after cleanup, with original core code and `LATENCY_SAMPLES=3`:

```text
raw fetch _sid-check                   p50   1.4ms
raw socket.io connect + api            p50  17.5ms
new Agent environment()                p50 338.3ms
new ephemeral Agent environment()      p50 167.7ms
Agent.state(new scope)                 p50 106.3ms
Agent.state(existing uncached scope)   p50  52.9ms
Agent.state(cached scope)              p50   0.0ms
mutation + Agent.response()            p50  54.8ms
Agent.interact(existing scope)         p50  52.6ms
Agent.interact(sessions scope)         p50   4.2ms
mutation + Agent.synced()              p50  53.0ms
cross-agent watch delivery             p50  53.8ms
```

Longer earlier runs showed the same shape:

```text
raw fetch _sid-check                  p50 ~0.6-1.5ms
raw socket.io connect + api           p50 ~18-21ms
new Agent environment()               p50 ~321-325ms
new ephemeral Agent environment()     p50 ~163-165ms
Agent.state(new scope)                p50 ~100-101ms
Agent.state(existing uncached scope)  p50 ~51-52ms
Agent.state(cached scope)             p50 ~0ms
mutation + Agent.response()           p50 ~51-52ms
Agent.interact(existing scope)        p50 ~50-51ms
Agent.interact(sessions scope)        p50 ~3ms
mutation + Agent.synced()             p50 ~50-52ms
cross-agent watch delivery            p50 ~50-51ms
```

## Main Findings

### 1. BigQuery Is Not The Synchronous Latency Source

The BigQuery patch logging path is called from `recordPatch()` after the blocking `await sync(...)` in `core/source/persistence.js`.

Actual request path:

```text
patchState(...)
  -> Redis JSON transaction
  -> publish(...)
  -> await sync(...)
  -> recordPatch(...)
  -> return response
```

`recordPatch()` queues into `bigQueryBatchInserter().insert()`. That function schedules a later flush via `setTimeout(..., batchMs = 1000)` and does not await BigQuery before returning.

A/B test:

```text
                         BigQuery on   BigQuery no-op
Agent.state(new scope)     p50 101.4ms    p50 104.0ms
state(existing uncached)   p50  51.3ms    p50  52.7ms
mutation + response        p50  52.0ms    p50  52.7ms
interact(existing scope)   p50  51.1ms    p50  52.3ms
cross-agent delivery       p50  50.4ms    p50  52.8ms
```

Conclusion: BigQuery may add background timer/network activity, but it does not explain the common synchronous `50ms+` operation latency.

### 2. Server CPU Is Not Hot

Attached to `api-1:9229` using the DevTools protocol profiler while the latency probe ran.

Observed result:

```text
~99.89% of profiler samples were (program) / idle
```

Conclusion: this is wall-clock waiting, not CPU burn inside the API process.

### 3. `jsr:@db/postgres` Parameterized Queries Add A ~41ms Floor

Temporary server spans showed the original slow path was dominated by Postgres calls:

```text
sync.total                         p50 ~46.4ms
syncMetadata.total                 p50 ~45.3ms
syncMetadata.postgres.upsert       p50 ~43.8ms
postgres.queryObject               p50 ~43.4ms
```

Important detail: it was not just the `metadata` table. Any parameterized query through `jsr:@db/postgres@0.19.4` showed the same floor.

Measured inside the running API runtime through the inspector:

```text
select_literal               p50 ~0.2ms
select_param_int             p50 ~41.1ms
select_param_text            p50 ~41.1ms
metadata_pk_literal          p50 ~0.3ms
metadata_pk_param            p50 ~41.0ms
metadata_name_literal        p50 ~0.1ms
metadata_name_param          p50 ~41.6ms
scratch_table_upsert_param   p50 ~43.7ms
metadata_noop_update_param   p50 ~44.0ms
```

Same runtime, temporary comparison using `npm:pg@8.11.0`:

```text
npm_pg_literal               p50 ~0.15ms
npm_pg_param_int             p50 ~0.13ms
npm_pg_metadata_pk_param     p50 ~0.07ms
```

Temporary A/B swap of `core/source/postgres.js` from `jsr:@db/postgres` to `npm:pg` removed most server-side persistence latency:

```text
metadata.upsert              p50 ~43.6ms -> ~1.2ms
INSERT INTO sessions         p50 ~43.4ms -> ~1.1ms
INSERT INTO users            p50 ~42.8ms -> ~0.9ms
metadata.lookup              p50 ~41.7ms -> ~0.5ms
Agent.state(new scope)       p50 ~109ms  -> ~21ms
new Agent environment()      p50 ~339ms  -> ~84ms
```

Conclusion: replacing or working around the current Deno Postgres client parameterized-query path is the highest-confidence server-side speedup.

### 4. Remaining UUID Mutation Latency Is Subscription Echo / Response Ordering

After the temporary `npm:pg` swap, server-side UUID mutation handling was generally `~10-13ms`, but Agent-facing UUID mutations still often measured `~50ms`.

Raw protocol tests isolated this:

```text
raw UUID mutation with no subscription       p50 ~10ms
raw sessions mutation                        p50 ~3-4ms
raw UUID mutation with subscription active   p50 ~49ms
```

Timing with a subscribed UUID:

```text
response ~48-50ms
echo     ~8-9ms
gap      ~40ms between echo and response
```

This means the subscription echo is delivered quickly, then the direct response for the same mutation arrives around `40ms` later. This has the shape of delayed packet / same-connection ordering behavior when two Socket.IO messages are sent close together.

Temporary experiment: move `publish(...)` after `await sync(...)` in `patchState()`.

Result:

```text
raw subscribed UUID mutation p50 improved from ~49ms to ~13ms
p95 still hit ~42ms
Agent UUID mutation p50 improved to ~12-15ms
p95 still hit ~42ms
```

The p95 remained because delayed echoes from prior mutations can still interfere with subsequent responses.

Conclusion: after fixing Postgres, the next speedup is to redesign own-session subscription echo/response ordering. The response should not be delayed by an own echo for the same subscribed UUID.

## Relevant Code Paths

### UUID State Creation

`core/source/scope-to-id.js`

```text
Agent.state(uuid)
  -> subscription write to sessions
  -> coreSideEffects subscription handler
  -> scopeToId(domain, user, uuid)
  -> if new UUID:
       claimStateOwner(...)
       stateExists(...)
       setState(...)
       await sync(...)
  -> getState(...)
  -> send state response
```

Brand-new UUID state pays initialization plus metadata sync. Existing uncached UUID state pays less. Cached state is local and effectively free.

### UUID Writes

`core/source/persistence.js`

```text
patchState(...)
  -> clientForState(...)
  -> Redis JSON multi transaction
  -> publish(id, ...)
  -> await sync(domain, user, type, name)
  -> recordPatch(...)            # BigQuery queue, not awaited
  -> return { ii, type }
```

`core/source/sync.js`

```text
sync(...)
  -> configuration(domain)
  -> scopeToId(domain, user, scope)
  -> if no typed table matches active_type:
       syncMetadata(domain, id)
  -> else:
       getState(...)
       postgres.setRow(...)
       postgres.query(...)
       syncMetadata(...)
```

`syncMetadata(...)` reads metadata-ish fields from Redis, then performs a parameterized Postgres `INSERT ... ON CONFLICT DO UPDATE` into `metadata`.

### Subscription Response Path

`core/source/core-side-effects.js`

```text
sessions.active[session].subscriptions[id] add
  -> scopeToId(...)
  -> authorize(...)
  -> subscribe(...)
  -> getState(...)
  -> send(...)
```

`core/source/subscribe.js` registers Redis subscription callbacks and sends updates back through the same client connection.

## Diagnostics Used

### Latency Probe

Added as a reusable utility:

```sh
cd /workspace/test
LATENCY_SAMPLES=20 npm run test:latency
```

Useful env vars:

```sh
LATENCY_SAMPLES=20
LATENCY_API_HOST=api-1:8765
API_HOST=api-1:8765
TEST_URL=https://localhost:5112/
LATENCY_NO_FORCE_EXIT=1
```

Probe coverage:

```text
raw fetch _sid-check
raw socket.io connect + api
new Agent environment()
new ephemeral Agent environment()
Agent.state(new scope)
Agent.state(existing uncached scope)
Agent.state(cached scope)
mutation + Agent.response()
Agent.interact(existing scope)
Agent.interact(sessions scope)
mutation + Agent.synced()
cross-agent watch delivery
```

### Server-Side Temporary Instrumentation

Temporary `KL_LATENCY_TRACE` spans were added and then reverted around:

```text
patchState()
scopeToId()
sync()
syncMetadata()
postgres.queryObject()
coreSideEffects subscription handling
handleConnection message handling
handleSideEffects()
```

Those spans established:

```text
Redis JSON operations: usually ~1-2ms
Postgres parameterized queries through jsr:@db/postgres: usually ~41-44ms
Side-effect worker execution: usually ~1-2ms for this probe
Full server UUID message handler with npm:pg A/B: usually ~10-13ms
```

### Raw Protocol Tests

One-off Node scripts used `socket.io-client` directly to bypass Agent internals. These showed:

```text
same API transport, no Agent queue:
  UUID mutate without subscription: ~10ms
  UUID mutate with subscription:    ~49ms
```

This proved the residual `~50ms` after the Postgres fix is not Agent queue batching; it is tied to subscribed UUID echo plus direct response delivery on the same connection.

## Recommended Next Work

1. Fix the Postgres client/query path first.

Possible approaches:

```text
Option A: Replace jsr:@db/postgres with npm:pg in core/source/postgres.js.
Option B: Find a Deno Postgres client option that avoids the slow extended parameterized path.
Option C: Use literal interpolation only for tightly controlled internal queries, but this is riskier and not a general solution.
```

The `npm:pg` A/B is the strongest evidence and produced the largest improvement.

Validation after a Postgres-client change:

```sh
cd /workspace/test
LATENCY_SAMPLES=20 npm run test:latency
npm test
```

Also run targeted Postgres tests if iterating:

```sh
cd /workspace/test
TEST_GREP="Postgres" npm test
```

2. Fix subscribed UUID response ordering.

Potential directions:

```text
Do not send own subscription echoes before the direct response.
Tag or suppress same-session own echoes where safe.
Send direct response before publish, then send/publish the echo.
Use a separate channel/connection for subscription echoes.
Batch or defer subscription echoes without delaying direct responses.
```

The simple `publish after sync` experiment improved p50 but not p95, so a complete fix likely needs explicit own-echo ordering/suppression rather than only moving one call.

3. Re-check full-suite behavior.

The performance investigation avoided keeping core edits. Before finalizing optimizations, re-run the primary harness:

```sh
cd /workspace/test
npm test
```

Previous context from this investigation: the full suite had a separate domain-agent lifecycle issue exposed while iterating. Keep that separate from the latency work unless it still reproduces after the current workspace is cleaned up.

## Caveats

- All core/server/client tracing and A/B swaps were temporary and reverted.
- The `npm:pg` result was an exploratory proof, not a finished production patch.
- The current latency probe is intentionally diagnostic and may be expanded or removed before finalizing the branch.
- The common `50ms+` number has at least two contributors:
  - Original server-side parameterized Postgres floor.
  - Subscribed UUID echo/response ordering.

