import { executeWorkerScript } from './handle-side-effects.js'

export default async function handleGuarantee(guarantee) {
  const domain = 'wherever'
  const user = 'whoever'
  const script = guarantee.script
  const variables = []
  const session = 'whenever'

  executeWorkerScript(domain, user, script, variables, session)
}
