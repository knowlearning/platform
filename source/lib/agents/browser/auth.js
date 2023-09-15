const AUTH_HOST = 'https://auth.knowlearning.systems'

function login() {
  const provider = 'google'
  const state = Math.random().toString(36).substring(2)
  localStorage.setItem('state', state)

  window.location.href = `${AUTH_HOST}/${provider}/${state}/${encodeURIComponent(window.location.href)}`
}

function logout() {
  //  Doing this will establish a new anonymous session
  localStorage.setItem('token', Math.random().toString(36).substring(2))
  window.location.reload()
}

async function getToken() {
  // Browser tokens are 1 time use
  const token = localStorage.getItem('token')
  localStorage.removeItem('token')
  return token
}

export {
  getToken,
  login,
  logout
}

