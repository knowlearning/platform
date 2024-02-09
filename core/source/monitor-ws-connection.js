const PING_INTERVAL = 10000
const HEARTBEAT_INTERVAL = 5000

export default function monitorWsConnetion(ws) {
  // Listen for pong messages from the client
  let isAlive, heartbeatTimeout
  ws.addEventListener('close', () => isAlive = false)

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

  return heartbeat
}