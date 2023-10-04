import fs from 'fs'
import { typeToExtension } from './utils/metadata-utils.js'

const { CACHE_DIRECTORY } = process.env

const getUUIDs = source => source.match(/[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}/g) || []

export default async function recursivelyLoad(id, halt, cache={},existingFiles={}) {
  if (halt && halt()) return
  if (cache[id]) return cache

  const extension = await existingFiles[id]
  if (extension) cache[id] = fs.promises.readFile(`${CACHE_DIRECTORY}/${id}.${extension}`).then(x => x.toString())
  else {
    cache[id] = (
      Agent
        .download(id)
        .then(async data => {
          const arrayBuffer = await data.arrayBuffer()

          //  TODO: do caching at agent level & make configurable so cache can be backed by
          //        arbitrary function (like one that writes the files in the way the build server wants to consume)
          existingFiles[id] = new Promise(async resolve => {
            const { active_type } = await Agent.metadata(id) || { active_type: 'text/plain' }
            const extension = typeToExtension(active_type)
            await fs.promises.writeFile(`${CACHE_DIRECTORY}/${id}.${extension}`, Buffer.from(arrayBuffer))
            resolve(extension)
          })

          return String.fromCharCode.apply(null, new Uint8Array(arrayBuffer))
        })
    )
  }

  cache[id] = await cache[id]

  await Promise.all(
    getUUIDs(cache[id])
      .filter(id => !cache[id])
      .map(id => recursivelyLoad(id, halt, cache))
  )

  return cache
}
