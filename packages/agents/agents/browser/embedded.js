import EmbeddedAgent from '../embedded.js'

export default () => {
  const parent = window.opener ? window.opener : window.parent
  return EmbeddedAgent(
    message =>  parent.postMessage(message, '*'),
    {
      addMessageListener: listener => window.addEventListener('message', ({ data }) => listener(data)),
      fetch: fetch.bind(globalThis)
    }
  )
}
