import net from 'node:net'

const LOCAL_GCS_HEALTHCHECK = 'https://localhost:4443/_internal/healthcheck'
const UPSTREAM_GCS_HEALTHCHECK = 'https://gcs-emulator:4443/_internal/healthcheck'
const UPSTREAM_HOST = 'gcs-emulator'
const UPSTREAM_PORT = 4443
const LISTEN_PORT = 4443
const HEALTHCHECK_TIMEOUT_MS = 1000
const CLOSE_TIMEOUT_MS = 250

async function canReachFakeGCS(url) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(HEALTHCHECK_TIMEOUT_MS)
    })
    return response.ok
  }
  catch (_) {
    return false
  }
}

function closeServer(server) {
  return new Promise(resolve => {
    server.close(error => {
      if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') {
        console.warn('Error closing fake-GCS localhost shim', error)
      }
      resolve()
    })
  })
}

function closeTimeout() {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, CLOSE_TIMEOUT_MS)
    timer.unref?.()
  })
}

async function listen(server, options) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(options, () => {
      server.off('error', reject)
      resolve()
    })
  })
}

export async function startGCSLocalhostShim() {
  if (await canReachFakeGCS(LOCAL_GCS_HEALTHCHECK)) return async () => {}

  if (!await canReachFakeGCS(UPSTREAM_GCS_HEALTHCHECK)) {
    throw new Error(
      `Embedded upload/download tests require fake-GCS at ${UPSTREAM_GCS_HEALTHCHECK}. ` +
      'Check that the gcs-emulator Compose service is running.'
    )
  }

  const sockets = new Set()
  const server = net.createServer(client => {
    const upstream = net.connect({ host: UPSTREAM_HOST, port: UPSTREAM_PORT })
    client.unref()
    upstream.unref()
    sockets.add(client)
    sockets.add(upstream)

    const destroyPair = () => {
      sockets.delete(client)
      sockets.delete(upstream)
      client.destroy()
      upstream.destroy()
    }

    client.on('close', destroyPair)
    client.on('error', destroyPair)
    upstream.on('close', destroyPair)
    upstream.on('error', destroyPair)

    client.pipe(upstream)
    upstream.pipe(client)
  })

  try {
    await listen(server, { host: '::', port: LISTEN_PORT, ipv6Only: false })
    server.unref()
  }
  catch (error) {
    if (error.code === 'EADDRINUSE') {
      throw new Error(
        `Port ${LISTEN_PORT} is already in use, but ${LOCAL_GCS_HEALTHCHECK} is not reachable. ` +
        'Embedded upload/download tests need localhost:4443 to route to fake-GCS.'
      )
    }
    throw error
  }

  if (!await canReachFakeGCS(LOCAL_GCS_HEALTHCHECK)) {
    sockets.forEach(socket => socket.destroy())
    await Promise.race([closeServer(server), closeTimeout()])
    throw new Error(
      `Started localhost:${LISTEN_PORT} fake-GCS shim, but ${LOCAL_GCS_HEALTHCHECK} is still unreachable.`
    )
  }

  return async () => {
    sockets.forEach(socket => socket.destroy())
    await Promise.race([closeServer(server), closeTimeout()])
  }
}
