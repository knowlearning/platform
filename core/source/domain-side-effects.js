import { uuid, writeFile } from './utils.js'
import configuration from './configuration.js'

const domainAgents = {}

function getAgent(domain) {
  if (domainAgents[domain]) return domainAgents[domain]

  domainAgents[domain] = new Promise(async resolve => {
    const config = await configuration(domain)
    if (config.agent) {
      const filename = `/core/source/${uuid()}.js`
      await writeFile(filename, config.agent)
      const workerUrl = new URL(filename, import.meta.url).href
      console.log('RUNNING WORKER!!!!!!!!!!!!!!!!', workerUrl)
      const worker = new Worker(workerUrl, { type: "module", })
      worker.onerror = event => console.log('DOMAIN AGENT ERROR', event)
      worker.onmessage = event => console.log('DOMAIN AGENT MESSAGE', domain, event)
      resolve(worker)
    }
    else {
      delete domainAgents[domain]
      resolve()
    }
  })

  return domainAgents[domain]
}

export default async function domainSideEffects({ domain, active_type }) {
  const domainAgent = await getAgent(domain)
  if (domainAgent) {
    //  TODO: use agent interface...
    domainAgent.postMessage({ data: "hello from parent!" })
  }
}