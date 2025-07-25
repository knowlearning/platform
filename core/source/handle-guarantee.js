import { executeWorkerScript } from './handle-side-effects.js'

export default async function handleGuarantee(domain, user, session, guarantee) {
  const script = guarantee.script
  const variables = []

  executeWorkerScript(domain, user, script, variables, session)
}
