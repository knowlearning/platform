import { executeWorkerScript } from './handle-side-effects.js'

export default async function handleGuarantee(domain, user, session, guarantee) {
  const { script, context, namespaces } = guarantee
  const variables = []

  executeWorkerScript(domain, user, script, variables, session, context, namespaces)
}
