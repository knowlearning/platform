import uploads from './uploads.js'
import downloads from './downloads.js'
import configure from './configure.js'
import claims from './claims.js'

export default {
  'application/json;type=upload': uploads,
  'application/json;type=download': downloads,
  'application/json;type=domain-config': configure,
  'application/json;type=domain-claim': claims
}