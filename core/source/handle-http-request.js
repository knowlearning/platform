import { randomBytes, getCookies, requestDomain } from './utils.js'
import handleConnection from './handle-connection.js'

export default function handleHTTPRequest(request) {
  const domain = requestDomain(request)
  const previousSid = getCookies(request.headers)['sid']
  const sid = previousSid || randomBytes(16, 'hex')

  const headers = new Headers()

  const newSidCreated = previousSid !== sid

  if (newSidCreated) {
    //  TODO: add partitioned when we can (must wait unti we can successfully set sid with ws connection)
    headers.set('set-cookie', `sid=${sid}; Secure; HttpOnly; SameSite=None; Partitioned`)
  }

  if (request.headers.get("upgrade") != "websocket") {
    headers.set("Access-Control-Allow-Origin",  `https://${domain}`)
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    headers.set("Access-Control-Allow-CREDENTIALS", "true")
    headers.set("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")

    const isSidCheck = request.url.endsWith('/_sid-check')
    const responseInit = { headers, status: newSidCreated && isSidCheck ? 201 : 200 } // status hack for setting sid cookie since deno websocket responses don't yet set cookie headers
    return new Response("WebSocket API Available", responseInit)
  }

  const { socket, response } = Deno.upgradeWebSocket(request, { idleTimeout: 10, headers })

  const connection = {
    send(message) { socket.send(message ? JSON.stringify(message) : '') },
    close(error) {
      socketError = error
      socket.close()
    }
  }

  socket.addEventListener('message', ({ data }) => {
    try {
      connection.onmessage(JSON.parse(data))
    }
    catch (error) {
      console.warn('ERROR PARSING MESSAGE', error)
      socket.send(JSON.stringify({ error: 'Error Parsing Message' }))
    }
  })

  let socketError
  socket.addEventListener('error', error => socketError = error)
  socket.addEventListener('close', () => connection.onclose(socketError?.toString()))

  handleConnection(connection, domain, sid)

  return response
}
