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
    replaceUrl(origin)
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

function replaceUrl(newUrl) {
  // Create a new URL object based on the current location
  const currentUrl = new URL(window.location.href)
  const newUrlObj = new URL(newUrl, currentUrl)

  // Construct the new URL by keeping the protocol and host
  const updatedUrl = `${currentUrl.protocol}//${currentUrl.host}${newUrlObj.pathname}${newUrlObj.search}${newUrlObj.hash}`

  // Use history.replaceState to update the URL without reloading
  window.history.replaceState({}, '', updatedUrl)
}


export {
  login,
  logout
}