import executeWorkerScript from './execute-worker-script.js'

export default async function handleGuarantee(domain, user, session, guarantee) {
  const { script, context, namespaces } = guarantee
  const variables = []

  //  TODO: "script" from above should be a name for a "guarantee" script configured at the domain level
  //executeWorkerScript(false, domain, user, scriptFromDomainConfig, variables, session, context, namespaces)
}
