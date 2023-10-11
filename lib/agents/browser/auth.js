const AUTH_HOST = 'https://auth.knowlearning.systems'

// auth token info is sent with pathnames of form /auth/VERIFICATION_STATE/PROVIDER_TOKEN
if (window.location.pathname.startsWith('/auth/')) {
  const state_token = window.location.pathname.slice(6)
  const [state] = state_token.split('/', 1)
  const origin = window.localStorage.getItem(state)
  if (origin) {
    const token = state_token.slice(state.length + 1)
    window.localStorage.setItem('token', token)
    window.location.href = origin
  }
}

function login() {
  const provider = 'google'
  const state = Math.random().toString(36).substring(2)
  window.localStorage.setItem(state, window.location.href)

  window.location.href = `${AUTH_HOST}/${provider}/${state}/${encodeURIComponent(window.location.href)}`
}

function logout() {
  //  Doing this will establish a new anonymous session
  window.localStorage.setItem('token', Math.random().toString(36).substring(2))
  window.location.reload()
}

async function getToken() {
  const token = localStorage.getItem('token')
  window.localStorage.removeItem('token')
  return token
}

export {
  getToken,
  login,
  logout
}

