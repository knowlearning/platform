import { v1 as uuid } from 'uuid'
import { applyPatch } from 'fast-json-patch/index.mjs'
import { io } from 'socket.io-client'
import GenericAgent from '../generic/index.js'

const sidByApiHost = new Map()
let token

const DEFAULT_API_HOST = process.env.API_HOST || 'socket-io.knowlearning.systems'
const randomToken = () => Math.random().toString(36).substring(2)
const inferDomain = () => (
  globalThis.window?.location?.host
  || process.env.AGENT_DOMAIN
  || (process.env.TEST_URL ? new URL(process.env.TEST_URL).host : 'localhost')
)

async function defaultGetToken() {
  const nextToken = token
  token = undefined
  return nextToken
}

async function login() {
  throw new Error('Node root agent login is not supported')
}

function logout() {
  token = randomToken()
}

async function ensureSidEstablished(apiHost, origin) {
  const response = await fetch(`https://${apiHost}/_sid-check`, {
    method: 'GET',
    headers: { origin }
  })

  if (response.status === 201) {
    sidByApiHost.set(apiHost, await response.text())
  }
  else if (response.status === 200) {
    sidByApiHost.delete(apiHost)
  }
  else {
    console.warn('Issue Connecting To the API Server')
  }
}

export default function rootAgent(options={}) {
  const apiHost = options.apiHost || DEFAULT_API_HOST
  const domain = options.domain || inferDomain()
  const origin = options.origin || `https://${domain}`
  const sidReady = ensureSidEstablished(apiHost, origin)
  const allowInsecureTLS = process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'

  const Connection = function () {
    let socket
    let closed = false
    const pendingMessages = []

    const openSocket = () => {
      if (closed) return

      const sid = sidByApiHost.get(apiHost)
      socket = io(`https://${apiHost}`, {
        withCredentials: true,
        ...(allowInsecureTLS ? { rejectUnauthorized: false } : {}),
        extraHeaders: {
          origin,
          ...(sid ? { sid } : {})
        }
      })

      socket.io.on('packet', () => {
        if (this.onmessage) this.onmessage(undefined)
      })

      socket.on('connect', () => {
        socket.io.engine?.on('ping', () => {
          if (this.onmessage) this.onmessage(undefined)
        })

        if (this.onopen) this.onopen()
        while (pendingMessages.length) send(pendingMessages.shift())
      })

      socket.on('message', data => {
        if (this.onmessage) this.onmessage(data)
      })

      socket.on('error', error => {
        if (this.onerror) this.onerror(error)
      })

      socket.on('connect_error', error => {
        if (this.onerror) this.onerror(error)
      })

      socket.on('disconnect', reason => {
        if (this.onclose) this.onclose(reason)
      })
    }

    sidReady
      .catch(error => console.warn('Issue Establishing API Server Session', error))
      .finally(openSocket)

    const send = message => {
      try {
        socket.emit('message', message)
      }
      catch (error) {
        console.warn('Error sending via socket.io', error)
      }
    }

    this.send = message => {
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

  const languages = [...(globalThis.navigator?.languages || [])]

  const agent = GenericAgent({
    token: options.getToken || defaultGetToken,
    sid: () => sidByApiHost.get(apiHost),
    domain,
    Connection,
    uuid,
    fetch,
    applyPatch,
    login,
    logout,
    variables: { LANGUAGES: languages },
    reboot: options.reboot || (() => process.exit(1))
  })

  agent.close = () => {}

  return agent
}
