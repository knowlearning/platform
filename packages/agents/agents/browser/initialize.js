import RootAgent from './root.js'
import EmbeddedAgent from './embedded.js'
import createEmbed from '../embed.js'
import selectFile from './select-file.js'

export default function browserAgent(options={}) {
  if (window.__default_knowlearning_agent && !options.unique) return window.__default_knowlearning_agent

  let embedded

  try { embedded = window.self !== window.top }
  catch (e) { embedded = true }

  const newAgent = embedded && !options.root ? EmbeddedAgent() : RootAgent(options)
  newAgent.embed = createEmbed(() => newAgent)

  const originalUpload = newAgent.upload
  newAgent.upload = async info => {
    if (info?.browser) {
      const file = await selectFile(info)
      if (!file) return
      if (info.validate && !(await info.validate(file))) return

      info.data = await file.arrayBuffer()
      if (!info.name) info.name = file.name
      if (!info.type) info.type = file.type
    }

    return originalUpload(info)
  }

  if (!window.__default_knowlearning_agent) window.__default_knowlearning_agent = newAgent

  return newAgent
}
