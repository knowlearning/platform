import RootAgent from './root.js'
import createEmbed from '../embed.js'

let Agent = globalThis.__default_knowlearning_agent

export default function nodeAgent(options={}) {
  if (Agent && !options.unique) return Agent

  const newAgent = RootAgent(options)
  newAgent.embed = createEmbed(() => newAgent)

  if (!Agent) globalThis.__default_knowlearning_agent = Agent = newAgent

  return newAgent
}
