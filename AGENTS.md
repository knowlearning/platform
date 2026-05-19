# Repository Development Instructions

This repo is mounted inside the Docker Compose Codex container at `/workspace`.
These instructions are for work performed from inside that container.

The automated test suite lives in `/workspace/test`. Run tests from that
directory so package scripts resolve the local harness and dependencies:

```sh
cd /workspace/test
npm test
```

The default `npm test` path runs the embedded Node/Vite harness
(`node run-embedded-tests.js`). It is the primary in-container verification
path and supports Mocha grep while iterating:

```sh
cd /workspace/test
TEST_GREP="suite or test name" npm test
```

Browser coverage is also available from the same test package. The browser
harness starts its own Vite server; no separate dev server is required.

```sh
cd /workspace/test
npm run test:local
```

Cross-server browser coverage uses the same runner with `CROSS_SERVER=1`:

```sh
cd /workspace/test
npm run test:cross-server
```

Useful test environment variables:

```sh
API_HOST=api-1:8765
API_HOSTS=api-1:8765,api-2:8765,api-3:8765
API_PORT=8765
SERVER_COUNT=3
ALIAS_COUNT=3
TEST_GREP="suite or test name"
TEST_TIMEOUT=180000
TEST_STARTUP_TIMEOUT=30000
TEST_URL=https://localhost:5112/
DEV_CONTROL_TOKEN=development-control-token
DEV_CONTROL_TIMEOUT=30000
POSTGRES_SERVERS='{"default":{"host":"postgres-1","port":5432,"user":"postgres","password":"insecure-development-password"},"postgres-2":{"host":"postgres-2","port":5432,"user":"postgres","password":"insecure-development-password"}}'
REDIS_SERVERS='{"default":{"host":"redis-1","port":6379,"password":""},"redis-2":{"host":"redis-2","port":6379,"password":""}}'
BROWSER_LOGS=1
HEADED=1
```

The Codex Compose service normally provides `API_HOST`, `API_HOSTS`,
`DEV_CONTROL_TOKEN`, `TEST_URL`, and `TEST_STARTUP_TIMEOUT`. If tests cannot
connect, check those environment variables and the Compose service names before
changing test code.

Useful in-container service endpoints:

```sh
api-1:8765
api-2:8765
api-3:8765
api-1:9229
api-2:9229
api-3:9229
postgres-1:5432
postgres-2:5432
redis-1:6379
redis-2:6379
http://gcs-emulator:8000
https://localhost:4443
```

From the host, `postgres-1` is bound to `localhost:5432` and `postgres-2` is
bound to `localhost:5433`.

Postgres routing is controlled by `POSTGRES_SERVERS` plus each domain config's
optional `postgres.server` value. Redis routing is controlled by
`REDIS_SERVERS` plus each domain config's optional `redis.server` value. Each
server map must include a `default` entry. On first use after a Postgres remap,
the target database is created and configured tables are repopulated from
Redis. Redis remaps copy data to the new server and leave the old copy intact
for admin-managed cleanup.

Codex does not have Docker access from inside this container. To restart local
development API servers after the host has bootstrapped the stack, use the dev
API control helper:

```sh
cd /workspace/test
node dev-api-control.js status
node dev-api-control.js restart
node dev-api-control.js restart api-1:8765
node dev-api-control.js restart api-1:8765 --inspect
node dev-api-control.js restart api-1:8765 --inspect-wait
node dev-api-control.js restart api-1:8765 --inspect-brk
```

Local API containers expose the standard Deno/V8 inspector on the Compose
network at `api-1:9229`, `api-2:9229`, and `api-3:9229`. The normal local
launch mode is `--inspect=0.0.0.0:9229`, which does not block startup. Use
`--inspect-wait` or `--inspect-brk` only with a single API host when startup
debugging is needed; that server will not become API-ready until an inspector
client attaches. Query `http://api-1:9229/json/list` from the Codex container to
discover the standard WebSocket debugger URL, then return the server to normal
startup with `node dev-api-control.js restart api-1:8765 --inspect`.

Use single-host restarts when testing reconnection, server handoff, or unstable
server behavior. The restart helper only restarts API processes; Postgres,
Redis, and the GCS emulator stay running so persisted state can be checked
across API restarts.

If `dev-api-control.js` reports that `/_dev/*` is unavailable, the running API
containers likely predate the dev control endpoint. Run the host-side bootstrap
once (`./develop backend`) before using in-container restart controls.

If test dependencies are missing, install them from the test package:

```sh
cd /workspace/test
corepack pnpm install --frozen-lockfile
```

If Playwright is installed but Chromium browser binaries are missing, install
the test package browser dependency:

```sh
cd /workspace/test
npm run test:install-browsers
```

Do not modify `core/` API server code unless the task explicitly asks for it. Prefer targeted test runs while iterating, then run the relevant full harness before finalizing.
