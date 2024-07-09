import { environment } from '../utils.js'

const {
  GOOGLE_OAUTH_CLIENT_CREDENTIALS,
  MICROSOFT_OAUTH_CLIENT_CREDENTIALS,
  CLASSLINK_OAUTH_CLIENT_CREDENTIALS
} = environment

export default {
  google: JSON.parse(GOOGLE_OAUTH_CLIENT_CREDENTIALS).web,
  microsoft: JSON.parse(MICROSOFT_OAUTH_CLIENT_CREDENTIALS).web,
  classlink: JSON.parse(CLASSLINK_OAUTH_CLIENT_CREDENTIALS).web
}