import handlePatch from '../patch.js'

export default async function (domain, user, session, patch, si, ii, send) {
  const { path, value } = patch[0]
  if (path.length === 1) {
    const [newId] = path
    const patchRequest = { ...value, user, domain }
    const swaps = await handlePatch(newId, patchRequest)
    send({ si, ii, swaps })
  }
  else send({ si, ii }) // non-side-effect inducing patch
}
