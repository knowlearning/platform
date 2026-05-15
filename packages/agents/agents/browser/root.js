import { v1 as uuid } from 'uuid'
import { applyPatch } from 'fast-json-patch/index.mjs'
import { getToken, login, logout } from './auth.js'
import GenericAgent from '../generic/index.js'
import { io } from 'socket.io-client'

const TEST_DOMAIN = 'tests.knowlearning.systems'
const LANGUAGES = [...navigator.languages]

const DEFAULT_API_HOST = localStorage.getItem('API_HOST') || 'socket-io.knowlearning.systems'
// const API_HOST = 'api-test.knowlearning.systems'
// const API_HOST = 'localhost:8765'

// TODO: remove sid hack when partitioned cookies via WS handshakes are supported
async function ensureSidEstablished(apiHost, sidStorageKey, reloadOnChange) {
  const response = await fetch(`https://${apiHost}/_sid-check`, {
    method: 'GET',
    credentials: 'include'
  })

  const hasLocalStorageSID = !!localStorage.getItem(sidStorageKey)
  if (response.status === 201) {
    if (!hasLocalStorageSID) {
      const sentSid = await response.text()
      localStorage.setItem(sidStorageKey, sentSid)
      if (reloadOnChange) location.reload()
    }
  }
  else if (response.status === 200) {
    if (hasLocalStorageSID) {
      localStorage.removeItem(sidStorageKey)
      if (reloadOnChange) location.reload()
    }
  }
  else {
    console.warn('Issue Connecting To the API Server')
  }
}

export default (options={}) => {
  const apiHost = options.apiHost || DEFAULT_API_HOST
  const hasExplicitApiHost = !!options.apiHost
  const sidStorageKey = hasExplicitApiHost ? `sid:${apiHost}` : 'sid'
  const sidReady = ensureSidEstablished(apiHost, sidStorageKey, !hasExplicitApiHost)

  const Connection = function () {
    let socket
    let closed = false
    const pendingMessages = []

    const openSocket = () => {
      if (closed) return

      const sid = localStorage.getItem(sidStorageKey)

      // socket.io client connection
      socket = io(`https://${apiHost}`, {
        withCredentials: true,
        extraHeaders: sid ? { sid } : {}
      })

      socket.on('connect', () => {
        if (this.onopen) this.onopen()
        while (pendingMessages.length) send(pendingMessages.shift())
      })

      socket.on('message', (data) => {
        debugLog('RECV', data)
        if (this.onmessage) this.onmessage(data)
      })

      socket.on('error', (err) => {
        if (this.onerror) this.onerror(err)
      })

      socket.on('disconnect', (reason) => {
        if (this.onclose) this.onclose(reason)
      })
    }

    if (hasExplicitApiHost) {
      sidReady
        .catch(error => console.warn('Issue Establishing API Server Session', error))
        .finally(openSocket)
    }
    else {
      sidReady.catch(error => console.warn('Issue Establishing API Server Session', error))
      openSocket()
    }

    const send = message => {
      debugLog('SEND', message)
      try {
        socket.emit('message', message)
      } catch (err) {
        console.warn('Error sending via socket.io', err)
      }
    }

    this.send = message => {
      //  TODO: more sophisticated enable/disable of debug messaging
      if (socket) send(message)
      else pendingMessages.push(message)
    }

    this.close = info => {
      closed = true
      this.send({ type: 'close', info })
      socket?.disconnect()
    }

    return this
  }

  const agent = GenericAgent({
    token: options.getToken || getToken,
    sid: () => localStorage.getItem(sidStorageKey),
    domain: window.location.host,
    Connection,
    uuid,
    fetch,
    applyPatch,
    login,
    logout,
    variables: { LANGUAGES },
    reboot: () => window.location.reload()
  })

  agent.local = () => {
    localStorage.setItem('api', 'local')
    location.reload()
  }
  agent.remote = (mode='production') => {
    localStorage.setItem('api', 'remote')
    localStorage.setItem('mode', mode)
    location.reload()
  }
  agent.close = () => {
    window.close()
  }

  return agent
}

function debugLog() {
  if (localStorage.getItem('__default_knowlearning_agent.debug')) console.log(...arguments)
}
