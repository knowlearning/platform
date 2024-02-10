import { uuid, writeFile } from './utils.js'
import configuration from './configuration.js'

const scriptCache = {}

function startWorker(filename, domain) {
  const workerUrl = new URL(filename, import.meta.url).href
  console.log('RUNNING WORKER!!!!!!!!!!!!!!!!', workerUrl)
  const worker = new Worker(workerUrl, { type: "module", })
  worker.onerror = event => console.log('Worker ERROR', event)
  worker.onmessage = event => console.log("RECEIVED FROM DOMAIN AGENT", domain, event)
  worker.postMessage({ data: "hello from parent!" })
}

export default async function domainSideEffects(domain, active_type) { 
  const config = await configuration(domain)
  const sideEffect = config?.sideEffects?.filter(({ type }) => type === active_type)
  if (sideEffect && sideEffect.length) {
    //  TODO: run all the side effects
    const { script } = sideEffect[0]
    if (!scriptCache[script]) {
      scriptCache[script] = new Promise(async resolve => {
        const filename = `/core/source/${uuid()}.js`
        await writeFile(filename, script)
        resolve(filename)
      })
    }
    const filename = await scriptCache[sideEffect[0].script]
    startWorker(filename, domain)
  }
}