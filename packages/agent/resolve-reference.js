//  TODO: persistent reference resolution
export default async function resolveReference(domain, user, scope, newType, newState) {
  const client = await natsClientPromise
  const { domain: envDomain, auth: { user: envUser }} = await environment()

  const response = await client.request('resolve', JSONCodec().encode({ domain, user, scope, newType, newState, envDomain, envUser }))
  return response.json()
}
