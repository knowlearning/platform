const PING_INTERVAL = 10000
const HEARTBEAT_INTERVAL = 5000

export default function monitorWsConnetion(ws) {
  // Listen for pong messages from the client
  let isAlive, heartbeatTimeout
  ws.on('pong', () => isAlive = true)
  ws.on('close', () => isAlive = false)

  function ping() {
    if (isAlive === false) return

    ws.ping()
    isAlive = null
    setTimeout(
      () => isAlive ? ping() : ws.terminate(),
      PING_INTERVAL
    )
  }

  function heartbeat() {
    clearTimeout(heartbeatTimeout)
    heartbeatTimeout = setTimeout(
      () => {
        if (ws.readyState === 1) {
          ws.send('')
          heartbeat()
        }
      },
      HEARTBEAT_INTERVAL
    )
  }

  heartbeat()
  ping()

  return heartbeat
}