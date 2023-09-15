import fs from 'fs'
import { v1 as uuid } from 'uuid'
import recursivelyLoad from './recursively-load.js'
import codemirrorReducer from './utils/codemirror-reducer.js'
import { typeToExtension } from './utils/metadata-utils.js'

const { CACHE_DIRECTORY } = process.env
const existingFiles = {}

const applySwaps = (source, swaps) => Object.entries(swaps).reduce((s, [ o, n ]) => s.replace(new RegExp(o, 'g'), n), source)
const getReferences = (ref, set) => Object.keys(set).filter(id => set[id].includes(ref))
const getAncestors = (id, set) => {
  const ancestorSet = {[id]: true}
  const newReferences = [id]
  while (newReferences.length) {
    getReferences(newReferences.shift(), set)
      .forEach(id => {
        if (!ancestorSet[id]) {
          ancestorSet[id] = true
          newReferences.push(id)
        }
      })
  }
  return Object.keys(ancestorSet)
}

export default async function patchContent({ root, scopes, user, domain }) {
  const set = await recursivelyLoad(root, () => {}, {}, existingFiles)

  const patches = await Promise.all(
    scopes.map( async scope => {
      const state = await Agent.state(scope, user, domain)
      return state
    })
  )

  //  grab and apply reducers to all bases from patches with changes
  const applyReducer = async ({ base, changes, reducer }) => {
    if (reducer === undefined) return
    //  TODO: allow for different kinds of reducers
    set[base] = await codemirrorReducer(set[base], changes)
  }

  await Promise.all(patches.map(applyReducer))

  const swaps = (
    patches
      .map(({ base }) => getAncestors(base, set))
      .flat()
      .reduce((o, id) => (o[id] = uuid(), o), {})
  )

  const uploadSwaps = async ([base, id]) => {
    const data = applySwaps(set[base], swaps)
    const md = await Agent.metadata(base) || { type: 'text/plain' }
    //  write data into local disk since it will probably be requested again for build
    const extension = typeToExtension(md.active_type)
    existingFiles[id] = (
      fs
        .promises
        .writeFile(`${CACHE_DIRECTORY}/${id}.${extension}`, data)
        .then(() => extension)
    )
    await existingFiles[id] //  TODO: assess if necessary...
    //  TODO: retry failed uploads
    //  TODO: decide if optimistic return before successful upload is the best approach
    //        (okay for now since client build requests are routed consistently to the
    //        same build agent...)
    //  TODO: this is probably why we're getting 404s on the client though...
    Agent
      .upload(md.name, md.active_type, data, id)
      .catch(error => console.error('UPLOAD ERROR', error))
  }

  await Promise.all(Object.entries(swaps).map(uploadSwaps))

  return swaps
}
