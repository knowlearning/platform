const params = new URLSearchParams(location.search)
const timeoutMs = Number.parseInt(params.get('timeout') || '10000', 10)
const apiHost = params.get('apiHost') || 'api-1:8765'
const childUrl = params.get('child') || 'https://old-child.localhost:5112/old-child.html'
const iframe = document.getElementById('child-frame')
const status = document.getElementById('status')

localStorage.setItem('API_HOST', apiHost)

const { default: Agent } = await import('@knowlearning/agents/browser.js')

const probe = window.__currentOldEmbedProbe = {
  startedAt: Date.now(),
  opened: false,
  closed: false,
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
  status.textContent = probe.events.map(e => `${e.elapsed}ms ${e.type} ${JSON.stringify(e.data)}`).join('\n')
  console.log(`[current-parent:${type}]`, data)
}

window.addEventListener('message', event => {
  const data = event.data
  record('window-message', {
    origin: event.origin,
    type: data?.type,
    requestId: data?.requestId,
    session: data?.session,
    keys: data && typeof data === 'object' ? Object.keys(data) : []
  })
})

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

iframe.addEventListener('load', () => {
  record('iframe-load', { src: iframe.src })
})

record('script-start', {
  href: location.href,
  childUrl,
  apiHost,
  embedded: Agent.embedded
})

try {
  const environment = await Agent.environment()
  record('environment', {
    domain: environment.domain,
    session: environment.session,
    user: environment.auth?.user,
    provider: environment.auth?.provider,
    version: environment.version,
    server: environment.server
  })

  const embedding = Agent.embed({ id: childUrl, mode: 'current-parent-old-child' }, iframe)
  embedding.on('open', () => {
    probe.opened = true
    record('embed-open', { src: iframe.src })
  })
  embedding.on('close', info => {
    probe.closed = true
    record('embed-close', info)
  })
}
catch (error) {
  record('error', {
    message: error?.message || String(error),
    stack: error?.stack,
    value: safeData(error)
  })
}

setTimeout(() => {
  probe.done = true
  record('timeout', {
    opened: probe.opened,
    closed: probe.closed,
    iframeSrc: iframe.src
  })
}, timeoutMs)
