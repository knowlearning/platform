import { uuid, isUUID, writeFile, getCookies } from './utils.js'
import authenticate from './authenticate/index.js'
import authorize from './authorize.js'
import interact from './interact/index.js'
import sideEffects from './side-effects/index.js'
import monitorWsConnection from './monitor-ws-connection.js'
import scopeToId from './scope-to-id.js'
import SESSION from './session.js'
import { ensureDomainConfigured } from './side-effects/configure.js'
import configuration from './configuration.js'
import configuredQuery from './configured-query.js'
import * as redis from './redis.js'
import initializationState from './initialization-state.js'
import subscriptions from './subscriptions.js'
import subscribe from './subscribe.js'

const sessionMessageIndexes = {}
const responseBuffers = {}
const activeWebsockets = {}

export default async function handleWebsocket(ws, upgradeReq) {
  let user, session, provider
  const sid = getCookies(upgradeReq.headers).sid

  const namedScopeCache = {}
  const origin = upgradeReq.headers.origin || 'https://core'  //  TODO: domain should probably be "development", "staging" or "production" based on mode...
  const { host: domain } = new URL(upgradeReq.url, origin)

  ensureDomainConfigured(domain)

  if (!sid) {
    console.warn(`Closing websocket due to missing sid for connection in domain: ${domain}`)
    ws.close()
  }

  const heartbeat = monitorWsConnection(ws)

  function send(message) {
    responseBuffers[session].push(message)
    if (activeWebsockets[session].readyState === 1) {
      activeWebsockets[session].send(JSON.stringify(message))
      heartbeat()
    }
  }

  ws.addEventListener('message', async ({ data }) => {
    let message

    try { message = JSON.parse(data) }
    catch (error) {
      console.warn(error)
      send({ error: 'Error Parsing Message' })
      return
    }

    if (!user) {
      try {
        const authResponse = await authenticate(message, domain, sid)
        user = authResponse.user
        provider = authResponse.provider
        session = authResponse.session

        //  TODO: consider making this cross server
        if (sessionMessageIndexes[session] === undefined) sessionMessageIndexes[session] = -1
        if (!responseBuffers[session]) responseBuffers[session] = []

        ws.send(JSON.stringify({
          domain,
          server: SESSION,
          session,
          auth: { user, provider, info: authResponse.info },
          ack: sessionMessageIndexes[session]
        }))

        activeWebsockets[session] = ws
        responseBuffers[session].forEach(r => ws.send(JSON.stringify(r)))
      }
      catch (error) {
        console.log(error)
        ws.send(JSON.stringify({ error: 'First Message Must Be A Valid Auth Message' }))
        ws.close()
      }
    }
    else {
      try {
        if (message.ack !== undefined) {
          const responseIndex = responseBuffers[session].findIndex(({ si }) => si === message.ack)
          responseBuffers[session].splice(0, responseIndex + 1)
        }
        else await processMessage(domain, user, session, namedScopeCache, message, send)
      }
      catch (error) {
        console.warn('ERROR PROCESSING MESSAGE', error)
        send({ si: message.si, error: `ERROR PROCESSING MESSAGE` })
      }
    }
  })
}

async function processMessage(domain, user, session, namedScopeCache, { scope, patch, si }, send) {
  if (si !== sessionMessageIndexes[session] + 1) {
    console.warn(`SKIPPING MESSAGE INDEX! TODO: INVESTIGATE CAUSE ${sessionMessageIndexes[session]} -> ${si}`)
  }
  sessionMessageIndexes[session] = si

  const id = namedScopeCache[scope] || await scopeToId(domain, user, scope)

  if (id !== scope) namedScopeCache[scope] = id

  const { ii, active_type } = await interact(domain, user, id, patch)
  if (scope === 'sessions') {
    const { op, path, value } = patch[0]
    if (op === 'add' && path.length === 4 && path[0] === 'active' && path[1] === session) {
      try {
        if (path[2] === 'queries') {
          const { query, params=[], domain:targetDomain=domain } = value
          const queryId = path[3]
          const queryStart = Date.now()
          const { rows, fields } = await configuredQuery(domain, targetDomain, query, params, user)
          const metricsPatch = [{ op: 'add', path: ['active', session, 'query', queryId, 'core_latency'], value: Date.now() - queryStart }]
          interact(domain, user, id, metricsPatch)
          send({ si, ii, rows, columns: fields.map(f => f.name) })
        }
        else if (path[2] === 'subscriptions') {
          const { scope: subscribedScope, user:scopeUser=user, domain:scopeDomain=domain } = value

          const id = await scopeToId(scopeDomain, scopeUser, subscribedScope)
          if (await authorize(user, domain, id)) {
            if (!subscriptions[session]) subscriptions[session] = {}

            const ss = subscriptions[session]
            if (!ss[id]) ss[id] = subscribe(id, send, subscribedScope)

            const state = await redis.client.json.get(id)
            send({ ...state, id, si })
          }
          else {
            let error = `User ${user} Not Autorized To Access ${subscribedScope}`
            if (scopeDomain !== domain) error += ` in ${scopeDomain}`
            send({ si, ii, error })
          }
        }
        else send({ si, ii })
      }
      catch (error) {
        console.warn(error)
        console.warn(path, patch)
        send({ si, ii, error: error.code })
      }
    }
    else send({ si, ii })
  }
  else {
    const sideEffect = sideEffects[active_type] || (() => send({ si, ii }))
    await sideEffect({ domain, user, session, scope: id, patch, si, ii, send })
  }

  const config = await configuration(domain)
  const sideEffect = config?.sideEffects?.filter(({ type }) => type === active_type)
  if (sideEffect && sideEffect.length) {
    //  TODO: run all the side effects
    const { script } = sideEffect[0]
    console.log('SIDE EFFECT?', sideEffect[0])
    if (!scriptCache[script]) {
      scriptCache[script] = new Promise(async resolve => {
        const filename = `./${uuid()}.js`
        await writeFile(filename, script)
        await new Promise((resolve, reject) => {
          exec(`deno cache ${filename}`, (error, stdout, stderr) => {
            if (error) console.warn('ERROR CACHING SCRIPT')
            resolve()
          })
        })
        resolve(filename)
      })
    }
    const filename = await scriptCache[sideEffect[0].script]
    exec(`deno run --allow-env=SERVE_HOST,SERVICE_ACCOUNT_TOKEN ${filename}`, logResults)
  }
}

const scriptCache = {}

function logResults(error, stdout, stderr) {
  if (error) {
    console.error(`Error running command: ${error.message}`)
    return
  }
  if (stderr) {
    console.error(`Command execution produced an error: ${stderr}`)
    return
  }
  console.log(`Command output: ${stdout}`)
}
