import { download } from '../storage.js'

export default async function ({ domain, user, session, patch, si, ii, send }) {
  for (let index = 0; index < patch.length; index ++) {
    const { op, path, value } = patch[index]
    if (op === 'add' && path.length === 1 && path[0] === 'active') {
      const { id } = value
      return send({ si, ii, url: await download(id) })
    }
  }

  send({ si, ii }) // non-side-effect inducing patch
}
