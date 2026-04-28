export function domainListAllowsDomain(domainPatterns, domain) {
  const patterns = typeof domainPatterns === 'string'
    ? [domainPatterns]
    : domainPatterns

  if (!Array.isArray(patterns)) return false

  return patterns.some(pattern => domainPatternMatchesDomain(pattern, domain))
}

export function domainPatternMatchesDomain(pattern, domain) {
  if (typeof pattern !== 'string' || typeof domain !== 'string') return false
  if (pattern === domain) return true
  if (!pattern.includes('*')) return false

  const expression = pattern
    .split('*')
    .map(escapeRegularExpression)
    // Keep wildcards scoped to one non-empty host label for authorization safety.
    .join('[^.]+')

  return (new RegExp(`^${expression}$`)).test(domain)
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
