import net from 'node:net'

const DEFAULT_REDIS_SERVERS = {
  default: { host: 'redis-1', port: 6379, password: '' },
  'redis-2': { host: 'redis-2', port: 6379, password: '' }
}

function redisServers() {
  const servers = process.env.REDIS_SERVERS
    ? JSON.parse(process.env.REDIS_SERVERS)
    : { ...DEFAULT_REDIS_SERVERS }

  if (!servers.default && servers['redis-1']) servers.default = servers['redis-1']

  return servers
}

function redisConnectionError(serverName, server, error) {
  const endpoint = `${serverName} (${server.host}:${server.port})`
  const message = `Redis diagnostics could not reach ${endpoint}: ${error.message}`

  if (['EAI_AGAIN', 'ENOTFOUND'].includes(error.code) && /^redis-\d+$/.test(server.host)) {
    return Object.assign(new Error(
      `${message}\n\n` +
      'The embedded tests use Docker Compose service DNS by default. ' +
      'Run them inside the Compose Codex container with ./develop test, or set ' +
      'REDIS_SERVERS=\'{"default":{"host":"localhost","port":6379,"password":""},' +
      '"redis-2":{"host":"localhost","port":6380,"password":""}}\' when running npm test directly on the host.'
    ), { cause: error, code: error.code })
  }

  return Object.assign(new Error(message), { cause: error, code: error.code })
}

function encodeCommand(args) {
  return `*${args.length}\r\n${args.map(arg => {
    const value = String(arg)
    return `$${Buffer.byteLength(value)}\r\n${value}\r\n`
  }).join('')}`
}

function readLine(buffer, offset) {
  const end = buffer.indexOf('\r\n', offset)
  if (end === -1) return null
  return [buffer.toString('utf8', offset, end), end + 2]
}

function parseResponse(buffer, offset=0) {
  if (offset >= buffer.length) return null

  const type = String.fromCharCode(buffer[offset])

  if (type === '+' || type === '-' || type === ':') {
    const line = readLine(buffer, offset + 1)
    if (!line) return null

    const [value, nextOffset] = line
    if (type === '-') throw new Error(value)
    if (type === ':') return [Number(value), nextOffset]
    return [value, nextOffset]
  }

  if (type === '$') {
    const line = readLine(buffer, offset + 1)
    if (!line) return null

    const [lengthText, start] = line
    const length = Number(lengthText)
    if (length === -1) return [null, start]
    const end = start + length
    if (buffer.length < end + 2) return null

    return [buffer.toString('utf8', start, end), end + 2]
  }

  if (type === '*') {
    const line = readLine(buffer, offset + 1)
    if (!line) return null

    const [lengthText, start] = line
    const length = Number(lengthText)
    if (length === -1) return [null, start]

    const values = []
    let nextOffset = start
    for (let index = 0; index < length; index += 1) {
      const parsed = parseResponse(buffer, nextOffset)
      if (!parsed) return null
      values.push(parsed[0])
      nextOffset = parsed[1]
    }

    return [values, nextOffset]
  }

  throw new Error(`Unexpected Redis response type "${type}"`)
}

async function command(serverName, args) {
  const server = redisServers()[serverName]
  if (!server) throw new Error(`Unknown Redis server "${serverName}"`)

  const commands = []
  if (server.password) {
    commands.push(server.username || server.user
      ? ['AUTH', server.username || server.user, server.password]
      : ['AUTH', server.password])
  }
  commands.push(args)

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: server.host, port: Number(server.port) })
    let buffer = Buffer.alloc(0)
    const responses = []

    socket.unref()

    socket.on('connect', () => {
      socket.write(commands.map(encodeCommand).join(''))
    })

    socket.on('data', chunk => {
      try {
        buffer = Buffer.concat([buffer, chunk])

        while (responses.length < commands.length) {
          const parsed = parseResponse(buffer)
          if (!parsed) break

          responses.push(parsed[0])
          buffer = buffer.slice(parsed[1])
        }

        if (responses.length === commands.length) {
          socket.destroy()
          resolve(responses[responses.length - 1])
        }
      }
      catch (error) {
        socket.destroy()
        reject(error)
      }
    })

    socket.on('error', error => reject(redisConnectionError(serverName, server, error)))
  })
}

async function jsonGet(serverName, key) {
  const value = await command(serverName, ['JSON.GET', key])
  return value === null ? null : JSON.parse(value)
}

async function del(serverName, key) {
  return command(serverName, ['DEL', key])
}

async function exists(serverName, key) {
  return command(serverName, ['EXISTS', key])
}

export {
  command,
  jsonGet,
  del,
  exists
}
