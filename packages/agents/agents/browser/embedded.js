import EmbeddedAgent from '../embedded.js'

export default () => {
  const parent = window.opener ? window.opener : window.parent
  return EmbeddedAgent(message =>  parent.postMessage(message, '*'))
}

