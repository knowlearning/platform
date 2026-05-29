import Agent from '@knowlearning/agents/browser.js'

const DEFAULT_ID = 'a5474480-0b4b-11f1-b7ee-5d6256466e2d'
const params = new URLSearchParams(location.search)
const targetId = params.get('id') || DEFAULT_ID
const timeoutMs = Number.parseInt(params.get('timeout') || '45000', 10)
const fakeAuth = params.get('fakeAuth') === '1'
const iframe = document.getElementById('target-frame')
const status = document.getElementById('status')

const probe = window.__liveEmbedProbe = {
  targetId,
  startedAt: Date.now(),
  opened: false,
  done: false,
  events: []
}

function safeData(value) {
  try {
    return structuredClone(value)
  }
  catch {
    try {
      return JSON.parse(JSON.stringify(value))
    }
    catch {
      return String(value)
    }
  }
}

function record(type, data={}) {
  const event = {
    type,
    elapsed: Date.now() - probe.startedAt,
    data: safeData(data)
  }
  probe.events.push(event)
  status.textContent = probe.events
    .map(({ elapsed, type, data }) => `${elapsed}ms ${type} ${JSON.stringify(data)}`)
    .join('\n')
  console.log(`[live-embed:${type}]`, data)
}

window.addEventListener('error', event => {
  record('window-error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  })
})

window.addEventListener('unhandledrejection', event => {
  record('unhandled-rejection', {
    reason: safeData(event.reason),
    reasonText: event.reason?.stack || event.reason?.message || String(event.reason)
  })
})

window.addEventListener('message', event => {
  const data = safeData(event.data)
  record('post-message', {
    origin: event.origin,
    type: data?.type,
    requestId: data?.requestId,
    session: data?.session,
    query: data?.query,
    scope: data?.scope,
    domain: data?.domain,
    params: data?.params,
    context: data?.context,
    keys: data && typeof data === 'object' ? Object.keys(data) : []
  })
})

iframe.addEventListener('load', () => {
  record('iframe-load', { src: iframe.src })
})

record('probe-start', {
  targetId,
  topOrigin: location.origin,
  apiHost: localStorage.getItem('API_HOST') || 'socket-io.knowlearning.systems',
  fakeAuth
})

try {
  const environment = await Agent.environment()
  record('agent-environment', {
    domain: environment.domain,
    user: environment.auth?.user,
    provider: environment.auth?.provider,
    session: environment.session,
    version: environment.version,
    server: environment.server
  })
}
catch (error) {
  record('agent-environment-error', {
    message: error?.message || String(error),
    stack: error?.stack
  })
}

try {
  const metadata = await Agent.metadata(targetId)
  record('target-metadata', {
    domain: metadata.domain,
    owner: metadata.owner,
    active_type: metadata.active_type,
    name: metadata.name
  })
}
catch (error) {
  record('target-metadata-error', {
    message: error?.message || String(error),
    stack: error?.stack
  })
}

try {
  const state = await Agent.state(targetId)
  record('target-state', {
    keys: state && typeof state === 'object' ? Object.keys(state) : [],
    reference: state?.reference,
    player: state?.reference?.player
  })
}
catch (error) {
  record('target-state-error', {
    message: error?.message || String(error),
    stack: error?.stack
  })
}

try {
  const target = {
    load(source) {
      record('target-load', { source })
      iframe.src = source
    },
    postMessage(message) {
      record('post-down', {
        type: message?.type,
        requestId: message?.requestId,
        session: message?.session,
        error: safeData(message?.error),
        responseKeys: message?.response && typeof message.response === 'object' ? Object.keys(message.response) : [],
        rows: Array.isArray(message?.response) ? message.response.length : undefined
      })
      iframe.contentWindow.postMessage(message, '*')
    },
    setLoadHandler(handler) {
      iframe.addEventListener('load', handler)
    },
    remove() {
      iframe.remove()
    },
    isMounted() {
      return iframe.isConnected
    }
  }
  const embedding = Agent.embed({ id: targetId, mode: 'live-embed-probe' }, target)
  if (fakeAuth) {
    embedding.on('environment', async user => {
      const environment = await Agent.environment(user)
      const response = {
        ...environment,
        auth: {
          ...environment.auth,
          provider: 'google',
          info: {
            ...environment.auth?.info,
            name: 'Live Embed Probe'
          }
        }
      }
      record('environment-override', {
        requestedUser: user,
        user: response.auth?.user,
        provider: response.auth?.provider,
        session: response.session
      })
      return response
    })
  }
  embedding.on('open', () => {
    probe.opened = true
    record('embed-open', { src: iframe.src })
  })
  embedding.on('close', info => {
    record('embed-close', info)
  })
}
catch (error) {
  record('embed-call-error', {
    message: error?.message || String(error),
    stack: error?.stack
  })
}

setTimeout(() => {
  probe.done = true
  record('probe-timeout', {
    opened: probe.opened,
    iframeSrc: iframe.src
  })
}, timeoutMs)
