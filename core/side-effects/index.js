import sessions from './sessions.js'
import subscriptions from './subscriptions.js'
import uploads from './uploads.js'
import downloads from './downloads.js'
import patches from './patches.js'
import config from './config.js'
import claims from './claims.js'
import query from './query.js'

export default {
  sessions,
  'application/json;type=subscription': subscriptions,
  'application/json;type=upload': uploads,
  'application/json;type=download': downloads,
  'application/json;type=postgres-query': query,
  patches,
  claims,
  config
}