import { download } from '../storage.js'

export default async function (domain, user, session, patch, si, ii, send) {
  const { path, op, value } = patch[0]

  if (op === 'add' && path.length === 1 && path[0] === 'active') {
    const { id } = value
    send({ si, ii, url: await download(id) })
  }
  else send({ si, ii }) // non-side-effect inducing patch
}
