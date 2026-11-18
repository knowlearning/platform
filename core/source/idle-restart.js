const MIN_UPTIME = 2 * 60 * 60 * 1000
const IDLE_INTERVAL = 65_000
const startedAt = performance.now()
let connections = 0
let idleSince = startedAt

export function connectionOpened() {
  connections++
  let closed = false
  return () => {
    if (closed) return
    closed = true
    connections--
    if (connections === 0) idleSince = performance.now()
  }
}

export function shouldRestart(reconnectionInterval=60_000) {
  const now = performance.now()
  return connections === 0
    && now - startedAt >= MIN_UPTIME
    && now - idleSince >= Math.max(IDLE_INTERVAL, Number(reconnectionInterval) + 1000)
}
