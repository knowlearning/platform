import { getCookies, randomBytes, uuid } from "./externals.js"
import Agent from './agent/deno/deno.js'

Deno.serve({ port: 8765 }, async request => {
  const headers = new Headers({
    "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
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

  if (code) {
    //  TODO: Go through OAuth2 code flow and establish link between sid
    //        and user profile, as well as token and user profile.
    //        "token" will be used by nats client to authenticate
  }
  else if (token) {
    //  TODO: HASH SID AND TOKEN!!!!!!!!!!!!!!!!!!!
    const session = await Agent.state(`user-session-${sid}`)

    if (!session.user) {
      const anonymousUser = await Agent.metadata(`user-anonymous-${sid}`)
      session.user = anonymousUser.id
    }

    const natsUser = await Agent.state(`user-nats-${token}`)
    natsUser.user = session.user
  }
  else {
    //  TODO: error, or potentially treat this as the log out case
  }

  return new Response("Hello, World!", { headers })
})
