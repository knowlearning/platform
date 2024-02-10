import interact from '../interact/index.js'
import configuredQuery from '../configured-query.js'

export default async function ({ domain, user, session, scope, patch, si, ii, send }) {
  for (let index = 0; index < patch.length; index++) {
    const { op, path, value: { query, params=[], domain:targetDomain=domain } } = patch[index]
    if (op !== 'add' || path.length !== 1 || path[0] !== 'active') continue
    try {
      const queryStart = Date.now()
      const { rows } = await configuredQuery(domain, targetDomain, query, params, user)
      const metricsPatch = [{ op: 'add', path: ['active', 'core_latency'], value: Date.now() - queryStart }]
      interact(domain, user, scope, metricsPatch)
      send({ si, ii, rows })
    }
    catch (error) {
      send({ si, ii, error: error.code })
    }
    return
  }

  send({ si, ii })
}
