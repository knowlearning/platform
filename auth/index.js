import { browserAgent } from '@knowlearning/agents'

const client_id = '603559646501-i29ma3u7c590ijimgp809vpdhg52jibd.apps.googleusercontent.com'
const redirect_uri = window.location.origin + '/'
const authEndpoint = 'https://accounts.google.com/o/oauth2/auth'

window.Agent = browserAgent()

if (window.location.pathname !== '/') {
  const [_, provider, state, origin] = window.location.pathname.split('/')
  const info = JSON.stringify({ origin: decodeURIComponent(origin), provider })
  localStorage.setItem(state, info)
  const nonce = Math.random().toString(36).substring(2)

  if (provider === 'google') {
    const query = {
      client_id,
      redirect_uri,
      prompt: 'select_account',
      response_type: 'code',
      scope: 'openid profile',
      nonce,
      state
    }

    const queryString = (
      Object
        .entries(query)
        .map(([k,v]) => `${k}=${v}`)
        .join('&')
    )

    window.location.href = `${authEndpoint}?${queryString}`
  }
}
else {
  const { state, code } = Object.fromEntries(new URLSearchParams(window.location.search).entries())

  if (code && state) {
    const { origin, provider } = JSON.parse(localStorage.getItem(state))
    window.location.href = `${origin}auth/${state}/${provider}-${code}`
    localStorage.removeItem(state)
  }
}

function parseHash(hash) {
  const params = hash.substr(1).split('&')
  const result = {}
  params.forEach(param => {
    const parts = param.split('=')
    result[parts[0]] = parts[1]
  })
  return result
}