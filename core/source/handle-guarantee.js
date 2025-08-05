import executeWorkerScript from './execute-worker-script.js'

export default async function handleGuarantee(domain, user, session, guarantee) {
  const { script, context, namespaces } = guarantee
  const variables = []

  //  TODO: check if we should refresh script domain agent instead of hardcoding false
  executeWorkerScript(false, domain, user, script, variables, session, context, namespaces)
}
