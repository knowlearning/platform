# Performance Investigation Update

Date: 2026-05-21

This note captures the current test-suite latency investigation so the project can be resumed without reconstructing the thread.

## Current Workspace State

- The Postgres migration has been applied and the focused Postgres suite is stable.
- A subscribed UUID response nudge is now applied in `packages/agents/agents/generic/message-queue.js`.
  - When a subscription echo arrives while the Agent still has outstanding direct responses, the client sends `{ ack: -1 }`.
  - The server already treats this as a no-op ack, but the tiny client-to-server frame collapses the TCP delayed-ACK/Nagle-shaped `~40ms` echo-to-response gap.
  - This keeps the existing wire API and server behavior unchanged; it is a client runtime implementation detail.
- A same-process subscription fast-path is now applied in `core/source/persistence.js` and `core/source/subscribe.js`.
  - The API server immediately delivers updates to local subscribers after the Redis state transaction.
  - The Redis publish still happens for cross-server delivery.
  - Published messages include `originServer`; the originating server ignores its returned Redis publish to avoid duplicate local echoes.
  - `originServer` is stripped before client delivery, so client update shape remains unchanged.
- A no-client-change server-only attempt was tested and reverted:
  - Holding same-session echoes until after the response preserved wire shape and latency, but broke existing Agent watcher/state assumptions.
  - Moving `publish(...)` after `sync(...)` preserved legacy echo-before-response behavior, but kept the `~50ms` response latency.
- The reusable latency probe now includes raw subscribed UUID response/echo timing:
  - `test/package.json`: adds `npm run test:latency`.
  - `test/latency-probe.js`: Vite-builds and runs the probe entry.
  - `test/latency-probe.entry.js`: measures raw API, Agent environment/state/mutation, synced, watch delivery, and raw subscribed UUID response ordering.
- Run performance probe from the test package:

```sh
cd /workspace/test
LATENCY_SAMPLES=20 npm run test:latency
```

- Restart API servers after core edits:

```sh
cd /workspace/test
node dev-api-control.js restart
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

Current runtime after the Postgres migration, `{ ack: -1 }` subscription nudge, and same-process subscription fast-path, with `LATENCY_SAMPLES=20`:

```text
raw fetch _sid-check                  p50   0.5ms
raw socket.io connect + api           p50  22.3ms
new Agent environment()               p50  73.5ms
new ephemeral Agent environment()     p50  42.6ms
Agent.state(new scope)                p50  18.1ms
Agent.state(existing uncached scope)  p50   8.6ms
Agent.state(cached scope)             p50   0.0ms
mutation + Agent.response()           p50   8.7ms
Agent.interact(existing scope)        p50   8.9ms
Agent.interact(sessions scope)        p50   3.1ms
mutation + Agent.synced()             p50   8.8ms
cross-agent watch delivery            p50   8.6ms
```

The raw subscribed UUID probe intentionally does not send the nudge, so it still demonstrates the underlying transport gap:

```text
raw subscribed UUID response          p50  46.8ms
raw subscribed UUID echo              p50   6.3ms
raw echo minus response gap           p50 -40.6ms
raw subscribed UUID response-first    0/20
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

## Compatibility Finding

### No-client-change server-only fix is insufficient

The fast path requires the direct response to arrive before the same-session own subscription echo. That keeps the wire shape unchanged, but it changes observable ordering for existing Agent clients. The focused Agent tests show those clients rely on the own echo updating local subscribed state before later watch/state setup proceeds.

Response-first, same-wire server-only attempt:

```text
mutation + Agent.response()           p50  9.2ms
raw subscribed UUID response          p50  8.9ms
raw subscribed UUID echo              p50  9.1ms
raw echo minus response gap           p50  0.2ms
raw subscribed UUID response-first    20/20
```

But focused correctness failed:

```text
TEST_GREP="Synced State|Watchers|Latest Bugfixes" npm test
# 143 passing, 25 failing
```

The failures were stale initial watcher/state reads, for example seeing `{}` before `{ x: 100 }`, plus embedded sync timeouts.

Publish-after-sync server-only attempt:

```text
mutation + Agent.response()           p50 52.8ms
raw subscribed UUID response          p50 52.7ms
raw subscribed UUID echo              p50 12.1ms
raw echo minus response gap           p50 -40.7ms
raw subscribed UUID response-first    4/20
```

Conclusion: keeping legacy Agent behavior and getting the `~9ms` response path conflict if the fix is server-only. The current stable fast implementation avoids changing server ordering by sending a no-op client frame after receiving an echo while a response is pending.

## Implemented Nudge

`packages/agents/agents/generic/message-queue.js`

```text
subscription echo arrives
  -> if any response promises are still outstanding:
       connection.send({ ack: -1 })
  -> continue normal watcher/state echo handling
```

Why this works:

- The response is already ready server-side, but delivery commonly stalls about `40ms` after an echo on the same connection.
- A tiny client-to-server frame forces timely TCP progress without changing response shape, echo shape, or public API calls.
- `{ ack: -1 }` is already used during auth/init flows and is not a valid positive message `si`, so it is effectively a protocol no-op for response accounting.
- The nudge is only sent when at least one direct response is outstanding, so idle subscription traffic does not add extra frames.

Validation:

```text
LATENCY_SAMPLES=20 npm run test:latency
mutation + Agent.response()           p50   8.9ms
Agent.interact(existing scope)        p50   8.3ms
mutation + Agent.synced()             p50   8.6ms
cross-agent watch delivery            p50   7.8ms
```

Focused correctness:

```text
TEST_GREP="Synced State|Watchers|Latest Bugfixes" npm test
# 168 passing
```

Full embedded harness:

```text
npm test
# 398 passing, 7 failing
```

Expected failures:

```text
6 mutable-state backslash failures
```

The remaining full-run failure was:

```text
Domain Agent > Can configure many agents in series and only 1 is active at a time
```

That exact test passed on immediate rerun:

```text
TEST_GREP="Can configure many agents in series and only 1 is active at a time" npm test
# 1 passing
```

## Implemented Same-Process Subscription Fast-Path

`core/source/persistence.js` and `core/source/subscribe.js`

```text
publish(id, message)
  -> tag message with originServer = SESSION
  -> synchronously deliver to subscriptionResponses[id] on this API process
  -> publish tagged message to Redis for other API processes

Redis subscription callback
  -> parse update
  -> ignore if update.originServer === SESSION
  -> strip originServer before client callback
```

Why this exists:

- It avoids waiting for Redis pub/sub when the writer and subscriber are already on the same API process.
- It keeps Redis as the cross-server fanout mechanism.
- It prevents duplicate local delivery when Redis sends the originating server's own publish back to it.
- It does not replace the client nudge, because local immediate delivery is still server-to-client and does not remove the delayed-ACK-shaped response gap.

Measured impact:

```text
LATENCY_SAMPLES=20 npm run test:latency
mutation + Agent.response()           p50   8.7ms
mutation + Agent.synced()             p50   8.8ms
cross-agent watch delivery            p50   8.6ms
raw subscribed UUID echo              p50   6.3ms
```

Conclusion: this is a correct simplification/robustness improvement for local subscribers, but it did not materially improve p50 latency because local Redis pub/sub was already around `6ms`. The remaining visible gap is still the transport-level echo/response interaction handled by the client nudge.

Validation after this change:

```text
TEST_GREP="Watchers|Synced State|Latest Bugfixes|Cross-server client correctness" npm test
# 176 passing

npm test
# 399 passing, 6 failing
```

The six full-suite failures are the known Redis JSONPath backslash failures.

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
raw subscribed UUID response
raw subscribed UUID echo
raw echo minus response gap
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

1. Decide whether the latency probe should remain as a committed diagnostic tool.

```sh
cd /workspace/test
LATENCY_SAMPLES=20 npm run test:latency
```

The probe is useful while performance is active work. If kept, consider adding thresholds or a historical baseline file so the final timing summary can be watched in CI or during local release checks.

2. Consider a lower-level transport fix only if Deno exposes one.

Node Socket.IO can often set `socket.conn.transport.socket.setNoDelay(true)`, but the current Deno WebSocket / Deno Socket.IO path does not expose an underlying TCP socket with `setNoDelay()`. If Deno or the Socket.IO dependency exposes that later, it would be cleaner than the `{ ack: -1 }` nudge.

## Caveats

- All temporary tracing logs and A/B swaps should remain out of the final patch.
- The current latency probe is diagnostic and may be expanded or removed before finalizing the branch.
- The original common `50ms+` number had at least two contributors:
  - Original server-side parameterized Postgres floor.
  - Subscribed UUID echo/response ordering.
