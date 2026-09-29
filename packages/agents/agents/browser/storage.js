export default {
  getItem(key) {
    try { return window.localStorage.getItem(key) }
    catch { return null }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value)
      return window.localStorage.getItem(key) === String(value)
    }
    catch { return false }
  },
  removeItem(key) {
    try {
      window.localStorage.removeItem(key)
      return window.localStorage.getItem(key) === null
    }
    catch { return false }
  }
}
