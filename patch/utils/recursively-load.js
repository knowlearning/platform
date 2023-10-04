const getUUIDs = source => source.match(/[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}/g) || []

export default async function recursivelyLoad(id, download, halt, cache={}) {
  if (halt && halt()) return
  if (cache[id]) return cache

  cache[id] = download(id).then(async data => {
    //  TODO: do caching at agent level & make configurable so cache can be backed by
    //        arbitrary function (like one that writes the files in the way the build server wants to consume)
    return String.fromCharCode.apply(null, new Uint8Array(await data.arrayBuffer()))
  })

  cache[id] = await cache[id]

  await Promise.all(
    getUUIDs(cache[id])
      .filter(id => !cache[id])
      .map(id => recursivelyLoad(id, download, halt, cache))
  )

  return cache
}
