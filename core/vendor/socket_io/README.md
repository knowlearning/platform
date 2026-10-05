# Socket.IO WebSocket transport patch

`websocket.ts` is a narrowly patched copy of the
[socket_io 0.2.1 transport](https://github.com/socketio/socket.io-deno/blob/50d89a797af604c01769daab88948b5395936774/packages/engine.io/lib/transports/websocket.ts).
Its upstream ISC license is preserved in `LICENSE`.

The exact transport URL is redirected here by `core/deno.json`. All other
Socket.IO modules remain pinned to 0.2.1. The copy preserves upstream TypeScript,
class fields, and comments. Its only differences are absolute, version-pinned
imports so it can live outside the upstream directory tree, and the message
guards described below.

Null or undefined WebSocket event data previously caused an uncaught
`data.byteLength` exception. The patch rejects these events before decoding,
reports a transport error, and closes the affected transport. Explicit closure
also covers pending polling-to-WebSocket upgrades, which do not yet have the
established socket's transport-error listener. Events arriving after the
transport starts closing are ignored. Valid message handling and payload limits
are unchanged.

This contains the process crash; it does not explain the anomalous null event
or fix the separate Deno HTTP panic. It does not change client reconnection or
application message handling.

Run the focused regression suite from `/workspace/test`:

```sh
TEST_GREP="Socket.IO WebSocket transport" npm test
```

Deployment must include this directory and use `core/deno.json`, including during
dependency caching. `core/deno.Dockerfile` copies it before the frozen install.
Do not patch the Deno cache directly. No new remote dependency is introduced.

When an upstream release includes equivalent handling, upgrade and test that
release, then remove the exact URL override and this directory together.
