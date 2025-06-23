import EmbeddedAgent from '../embedded.js'

export default () => {
  //  default to window opener if present
  const parent = window.opener ? window.opener : window.parent
  const agent = EmbeddedAgent(message =>  parent.postMessage(message, '*'))

  return agent
}

