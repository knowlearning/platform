export default function createConnection(worker, id, domain, DomainAgents) {
  let queue = []
  let closed = false

  const postMessage = m => worker.postMessage(m ? { ...m, connection: id} : m)

  return {
    async send(message) {
      if (closed) console.warn('MESSAGE SENT TO CLOSED CONNECTION', id, message)
      else if (!message) postMessage() // heartbeat
      else if (message.server) {
        // TODO: consider more reliable/explicit recognintion of auth response method
        postMessage(message)
        while (queue.length) postMessage(queue.shift())
        queue = null
      }
      else if (queue) queue.push(message)
      else postMessage(message)
    },
    close(info) {
      console.warn('WORKER CLOSED THROUGH CONNECTION!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', info)
      closed = true
      worker.terminate()
      delete DomainAgents[domain]
    }
  }
}