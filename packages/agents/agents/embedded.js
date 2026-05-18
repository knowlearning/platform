import createEmbeddedAgent from './generic/embedded.js'

function globalAddMessageListener(listener) {
  globalThis.addEventListener?.('message', ({ data }) => listener(data))
}

function globalFetch() {
  return globalThis.fetch?.bind(globalThis)
}

async function saveBrowserDownload(response, name) {
  const type = response.headers.get('Content-Type')
  const blob = new Blob([ await response.blob() ], { type })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.style.display = 'none'
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
}

export { createEmbeddedAgent }

export default function EmbeddedAgent(postMessage, runtime={}) {
  return createEmbeddedAgent({
    addMessageListener: globalAddMessageListener,
    fetch: globalFetch(),
    postMessage,
    saveDownload: saveBrowserDownload,
    ...runtime
  })
}
