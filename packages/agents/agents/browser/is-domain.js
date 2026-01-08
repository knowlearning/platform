export default function isDomain(value) {
  if (typeof value !== 'string') return false

  // reject protocol, path, query, fragment
  if (
    value.includes('://') ||
    value.includes('/') ||
    value.includes('?') ||
    value.includes('#')
  ) {
    return false
  }

  const hostPort = value.split(':')
  if (hostPort.length > 2) return false

  const [host, port] = hostPort

  // optional port: 1–65535
  if (port !== undefined) {
    if (!/^\d+$/.test(port)) return false
    const p = Number(port)
    if (p < 1 || p > 65535) return false
  }

  // localhost
  if (host === 'localhost') return true

  // DNS hostname with subdomains
  const hostnameRegex =
    /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/

  return hostnameRegex.test(host)
}
