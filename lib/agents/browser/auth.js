const AUTH_HOST = 'https://auth.knowlearning.systems'

if (window.location.pathname.startsWith('/auth/')) {
  const [state, token] = window.location.pathname.slice(6).split('/')
  const origin = localStorage.getItem(state)
  if (origin) {
    localStorage.setItem('token', token)
    window.location.href = origin
  }
}

function login() {
  const provider = 'google'
  const state = Math.random().toString(36).substring(2)
  localStorage.setItem(state, window.location.href)

  window.location.href = `${AUTH_HOST}/${provider}/${state}/${encodeURIComponent(window.location.href)}`
}

function logout() {
  //  Doing this will establish a new anonymous session
  localStorage.setItem('token', Math.random().toString(36).substring(2))
  window.location.reload()
}

async function getToken() {
  const token = localStorage.getItem('token')
  localStorage.removeItem('token')
  return token
}

export {
  getToken,
  login,
  logout
}

