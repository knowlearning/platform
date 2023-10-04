export default function pingLoop(ws, interval) {
  // Listen for pong messages from the client
  let isAlive
  ws.on('pong', () => isAlive = true)
  ws.on('close', () => isAlive = false)

  function loop() {
    if (isAlive === false) return

    ws.ping()
    isAlive = null
    setTimeout(() => {
      if (!isAlive) ws.terminate()
      else loop()
    }, interval)
  }

  loop()
}