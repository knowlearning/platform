import { extensionToType } from './metadata-utils.js'

//  these utility functions work in a web environment
const fileFromEntry = entry => new Promise((s,e) => entry.file(s,e))
const getTypeFromEntry = entry => fileFromEntry(entry).then(file => file.type)
const getDataFromEntry = entry => fileFromEntry(entry).then(file => file.arrayBuffer())

//  entries is of form: [{ fullPath, name }, ....]
export default async function createFolderContent(entries, upload, uuid, getType=getTypeFromEntry, getData=getDataFromEntry) {
  //  TODO: swap out internal references in files
  const swaps = {}
  const roots = {}
  const filenames = []
  entries.forEach(e => {
    const id = uuid(e.fullPath)
    swaps[e.fullPath] = id
    roots[id] = true
    filenames.push(e.name)
  })
  const metadata = []
  const body = []
  await Promise.all(
    entries.map(async entry => {
      const id = swaps[entry.fullPath]
      const type = await getType(entry)
      let data = await getData(entry)
      if (!type.startsWith('image/')) {
        //  TODO: this is probably the most fragile part and we probably want unit tests
        //        for reasonable return values for getData
        if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
          data = new TextDecoder("utf-8").decode(data)
        }
        Object
          .entries(swaps)
          .forEach(([from, to]) => {
            let reference = ''
            if (from === entry.fullPath) reference = `./${entry.name}`
            else {
              const e = entry.fullPath.split('/')
              const f = from.split('/')
              while (e[0] !== undefined && f[0] !== undefined && e[0] === f[0]) {
                e.shift()
                f.shift()
              }
              // for every entry dir past the common prefix, add a ../ for the reference
              if (e.length > 1) e.slice(0,-1).forEach(() => reference += '../')
              else reference = './'

              reference += f.join('/')
            }
            if (data.includes(reference)) {
              //  if found a reference to this swap, then
              //  the from reference cannot be a root
              //  TODO: fix the bug where this will delete root content that is part of a cycle
              delete roots[to]
              data = data.replaceAll(reference, to)
            }
          })
      }
      const segments = entry.name.split('.')
      const contentType = extensionToType(segments[segments.length - 1])

      await upload(entry.fullPath, contentType, data, id)
    })
  )
  return Object.keys(roots)
}