import process from 'node:process'
import { io } from 'socket.io-client'

const DEFAULT_API_HOST = 'socket-io.localhost:8765'
const DEFAULT_TEST_URL = 'https://localhost:5112/'
const DEFAULT_TIMEOUT_MS = 5000

export function normalizeHost(value) {
  const host = String(value || '').trim()
  if (!host) return ''

  try {
    return new URL(host.includes('://') ? host : `https://${host}`).host
  }
  catch (_) {
    return host
  }
}

export function configuredApiHosts() {
  const hosts = new Set()
  hosts.add(normalizeHost(process.env.API_HOST || DEFAULT_API_HOST))

  for (const host of (process.env.API_HOSTS || '').split(',')) {
    const normalized = normalizeHost(host)
    if (normalized) hosts.add(normalized)
  }

  return [...hosts].filter(Boolean)
}

function timeoutMs() {
  const value = Number.parseInt(process.env.API_PREFLIGHT_TIMEOUT || '', 10)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS
}

async function fetchSid(host, origin, timeout) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`https://${host}/_sid-check`, {
      method: 'GET',
      headers: { origin },
      signal: controller.signal
    })

    const body = await response.text()
    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`_sid-check returned ${response.status} ${response.statusText}: ${body}`)
    }

    return response.status === 201 ? body : undefined
  }
  catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`_sid-check timed out after ${timeout}ms`)
    }
    throw error
  }
  finally {
    clearTimeout(timer)
  }
}

function connectSocketIO(host, origin, sid, timeout) {
  return new Promise((resolve, reject) => {
    let finished = false
    let timer
    const socket = io(`https://${host}`, {
      withCredentials: true,
      rejectUnauthorized: false,
      reconnection: false,
      timeout,
      extraHeaders: {
        origin,
        ...(sid ? { sid } : {})
      }
    })

    const finish = (error, result) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      socket.disconnect()
      if (error) reject(error)
      else resolve(result)
    }

    timer = setTimeout(
      () => finish(new Error(`Socket.IO connection timed out after ${timeout}ms`)),
      timeout
    )

    socket.once('connect', () => {
      socket.once('api', response => finish(null, response))
      socket.emit('api')
    })

    socket.once('connect_error', error => {
      finish(new Error(`Socket.IO connect_error: ${error.message}`))
    })

    socket.once('error', error => {
      finish(new Error(`Socket.IO error: ${error.message || error}`))
    })
  })
}

export async function preflightApiHosts({ label='API preflight', hosts=configuredApiHosts(), timeout=timeoutMs() }={}) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

  const normalizedHosts = [...new Set(hosts.map(normalizeHost).filter(Boolean))]
  const origin = new URL(process.env.TEST_URL || DEFAULT_TEST_URL).origin
  const failures = []

  await Promise.all(normalizedHosts.map(async host => {
    try {
      const sid = await fetchSid(host, origin, timeout)
      await connectSocketIO(host, origin, sid, timeout)
    }
    catch (error) {
      failures.push(`${host}: ${error.message}`)
    }
  }))

  if (failures.length) {
    throw new Error(`${label} failed for ${failures.length}/${normalizedHosts.length} host(s):\n${failures.join('\n')}`)
  }

  console.log(`${label} passed: ${normalizedHosts.join(', ')}`)
}
