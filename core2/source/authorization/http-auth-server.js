import { getCookies, randomBytes, decryptBase64String, environment } from "./externals.js"
import Agent from './agent/deno/deno.js'
import JWTVerification from './authenticate/verify-jwt.js'

const { AUTH_SERVICE_SECRET_KEY } = environment

Deno.serve({ port: 8765 }, async request => {
  const origin = request.headers.get("Origin")
  const domain = (new URL(origin)).host
  const headers = new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true"
  })
  if (request.method === 'OPTIONS') return new Response(null, { headers })

  let sid = getCookies(request.headers)['sid']

  if (!sid) {
    sid = randomBytes(16, 'hex')
    const expireDate = new Date()
    expireDate.setTime(expireDate.getTime() + (30 * 24 * 60 * 60 * 1000))
    headers.set('set-cookie', `sid=${sid}; Secure; HttpOnly; SameSite=None; Expires=${expireDate.toUTCString()}; Partitioned;`)
  }

  const { token, code } = await request.json()
  const session = await Agent.state(`user-session-${sid}`)

  if (code) {
    const OAuthCodeInfo = JSON.parse(await decryptBase64String(AUTH_SERVICE_SECRET_KEY, code))
    if (OAuthCodeInfo.domain === domain) {
      const { provider, provider_id, info } = await new Promise((resolve, reject) => {
        const { code, provider } = OAuthCodeInfo
        JWTVerification(provider, code, resolve, reject)
      }).catch(error => {
        console.log('ERROR VERIFYING JWT', error)
        return { provider: 'anonymous', provider_id: sid, info: { name: 'Anonymous', picture: null } }
      })

      const userScopeName = `user-${provider}-${provider_id}`
      const userState = await Agent.state(userScopeName)

      //  TODO: encode user info with session as key! (we don't want to store on our servers)
      if (userState.name !== info.name) userState.name = info.name
      if (userState.picture !== info.picture) userState.picture = info.picture

      const { id } = await Agent.metadata(userScopeName)
      session.user = id
    }
  }

  //  TODO: HASH SID AND TOKEN!!!!!!!!!!!!!!!!!!!
  if (!session.user) {
    const { id } = await Agent.metadata(`user-anonymous-${sid}`)
    session.user = id
    session.domain = domain
  }

  if (token) {
    const natsUser = await Agent.state(`user-nats-${token}`)
    natsUser.user = session.user
    natsUser.domain = domain
  }

  return new Response(session.user, { headers })
})
