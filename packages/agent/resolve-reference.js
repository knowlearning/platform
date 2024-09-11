const cache = {}

export default async function resolveReference(domain, user, scope, newType, newState) {
  const key = JSON.stringify([domain, user, scope])

  if (!cache[key]) cache[key] = (async () => {
    const client = await natsClientPromise
    const env = await environment()
    const envDomain = env.domain
    const envUser = env.auth.user

    const requestInfo = { domain, user, scope, newType, newState, envDomain, envUser }
    const response = await client.request('resolve', JSONCodec().encode(requestInfo))
    return response.json()
  })()

  return cache[key]
}
