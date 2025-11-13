import { getCookies, requestDomain } from './utils.js'
import handleConnection from './handle-connection.js'

export default function handleSocketIOConnection(socket, metricsPromise) {
  const domain = requestDomain({ headers: socket.handshake.headers })
  const sid = getCookies(socket.handshake.headers)['sid']

  let sendOnCloseErrorReported = false
  let closeOnCloseErrorReported = false
  let socketError
  let closed = false

  const connection = {
    send(message) {
      if (socket.connected) {
        try {
          socket.emit('message', message)  // same channel name as WS `message` events
        } catch (err) {
          console.warn('Socket.IO send failed', domain, message, err)
        }
      } else if (!sendOnCloseErrorReported) {
        console.warn(`Socket.IO send called after disconnect`, domain, message)
        sendOnCloseErrorReported = true
      }
    },
    close(error) {
      socketError = error
      if (socket.connected) socket.disconnect(true)
      else if (!closeOnCloseErrorReported) {
        console.warn('Socket.IO close called after already disconnected', domain, error)
        closeOnCloseErrorReported = true
      }
    }
  }

  socket.on('message', (data) => {
    try {
      connection.onmessage(data)
    } catch (err) {
      console.warn('ERROR HANDLING SOCKET.IO MESSAGE', err)
      socket.emit('error', { error: 'Error handling message' })
    }
  })

  socket.on('connect', () => {
    metricsPromise.then(m => m.socketio.opened += 1)
  })

  socket.on('error', (err) => {
    metricsPromise.then(m => m.socketio.errored += 1)
    socketError = err
  })

  socket.on('disconnect', (reason) => {
    if (!closed) {
      metricsPromise.then(m => m.socketio.closed += 1)
      connection.onclose(socketError?.toString() || reason)
    } else {
      console.log('MULTIPLE SOCKET.IO CLOSES')
    }
    closed = true
  })

  handleConnection(connection, domain, sid, metricsPromise)
}
