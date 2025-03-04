import { uuid, randomBytes } from '../utils.js'
import { ensureDomainConfigured } from '../side-effects/configure.js'
import saveSession from '../authenticate/save-session.js'

export default async function createSession(domain, user) {
  const sid = randomBytes(32, 'hex')
  await ensureDomainConfigured(domain)
  await saveSession(domain, uuid(), sid, user, 'core', {
    user: domain,
    provider_id: domain,
    provider: 'core',
    info: { name: `${domain} Agent`, picture: null }
  })
  return sid
}
