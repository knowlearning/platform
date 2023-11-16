import subscriptions from './subscriptions.js'
import uploads from './uploads.js'
import downloads from './downloads.js'
import configure from './configure.js'
import claims from './claims.js'
import query from './query.js'

export default {
  'application/json;type=subscription': subscriptions,
  'application/json;type=upload': uploads,
  'application/json;type=download': downloads,
  'application/json;type=postgres-query': query,
  'application/json;type=domain-config': configure,
  'application/json;type=domain-claim': claims
}