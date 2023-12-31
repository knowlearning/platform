import { upload } from '../storage.js'
import interact from '../interact/index.js'
import * as redis from '../redis.js'

export default async function ({ domain, user, session, scope, patch, si, ii, send }) {
  for (let index = 0; index < patch.length; index++) {
    const { path, op, value } = patch[index]

    if (op === 'add' && path.length === 1 && path[0] === 'active') {
      const { id, type } = value
      const { url, info } = await upload(type)

      const isSet = await redis.client.set(info.id, id, { NX: true })
      if (!isSet) throw new Error(`Error reserving id for upload ${id}`)

      await interact(domain, user, id, [
        { op: 'add', value: type, path: ['active_type'] },
        { op: 'add', value: info, path: ['active'] },
        { op: 'add', value: true, path: ['external'] }
      ])

      send({ si, ii, url })
      return
    }
  }

  send({ si, ii }) // non-side-effect inducing patch
}
