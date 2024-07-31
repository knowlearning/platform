const AUTH_HOST = 'https://auth.knowlearning.systems'

const { location, localStorage } = window

// auth token info is sent with pathnames of form /auth/VERIFICATION_STATE/PROVIDER_TOKEN
if (location.pathname.startsWith('/auth/')) {
  const state_token = location.pathname.slice(6)
  const [state] = state_token.split('/', 1)
  const origin = localStorage.getItem(state)
  if (origin) {
    const token = state_token.slice(state.length + 1)
    localStorage.setItem('token', token)
    location.href = origin
  }
}

function randomToken() {
  return Math.random().toString(36).substring(2)
}

function login(provider='google') {
  const state = randomToken()
  localStorage.setItem(state, location.href)
  location.href = `${AUTH_HOST}/${provider}/${state}`
}

function logout() {
  //  Doing this will establish a new anonymous session
  localStorage.setItem('token', randomToken())
  location.reload()
}

export {
  login,
  logout
}