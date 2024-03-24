//  transform our custom path implementation to the standard JSONPatch path
export function standardJSONPatch(patch) {
  return patch.map(p => {
    const transformed = {...p, path: '/' + p.path.map(sanitizeJSONPatchPathSegment).join('/')}
    if (p.from) transformed.from = '/' + p.from.map(sanitizeJSONPatchPathSegment).join('/')
    return  transformed
  })
}

function sanitizeJSONPatchPathSegment(s) {
  if (typeof s === "string") return s.replaceAll('~', '~0').replaceAll('/', '~1')
  else return s
}