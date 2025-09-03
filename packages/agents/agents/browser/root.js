import { v1 as uuid } from 'uuid'
import { applyPatch } from 'fast-json-patch'
import { getToken, login, logout } from './auth.js'
import GenericAgent from '../generic/index.js'
import { io } from 'socket.io-client'

const TEST_DOMAIN = 'tests.knowlearning.systems'
const LANGUAGES = [...navigator.languages]

const API_HOST = localStorage.getItem('API_HOST') || 'api.knowlearning.systems'
// const API_HOST = 'api-test.knowlearning.systems'
// const API_HOST = 'localhost:8765'

export default options => {
  const Connection = function () {
    const sid = localStorage.getItem('sid')

    // socket.io client connection
    const socket = io(`https://${API_HOST}`, {
      withCredentials: true,
      extraHeaders: sid ? { sid } : {}
    })

    this.send = message => {
      try {
        socket.emit('message', message)
      } catch (err) {
        console.warn('Error sending via socket.io', err)
      }
    }

    this.close = info => {
      this.send({ type: 'close', info })
      socket.disconnect()
    }

    socket.on('connect', () => {
      if (this.onopen) this.onopen()
    })

    socket.on('message', (data) => {
      if (this.onmessage) this.onmessage(data)
    })

    socket.on('error', (err) => {
      if (this.onerror) this.onerror(err)
    })

    socket.on('disconnect', (reason) => {
      if (this.onclose) this.onclose(reason)
    })

    return this
  }

  const agent = GenericAgent({
    token: options.getToken || getToken,
    sid: () => localStorage.getItem('sid'),
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
