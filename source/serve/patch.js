import MutableProxy from '../lib/persistence/json.js'
import { client, subscriptions, connected } from './redis.js'
import interact from './interact/index.js'

const patchResponses = {}

connected
  .then(() => {
    // init patch-requests if doesn't exist
    client.json.set('core/core/patch-requests', '$', {ii: 0, state: {}, history: []}, { NX: true })

    subscriptions.subscribe('core/patch/results', message => {
      const { patch } = JSON.parse(message)
      if (patch[0].op === 'add') {
        const newId = patch[0].path[0]
        const swaps = patch[0].value

        if (patchResponses[newId]) {
          patchResponses[newId](swaps)
          delete patchResponses[newId]
        }
      }
    })
  })

const patchRequests = new MutableProxy({}, async patch => {
  const user = 'core'
  const domain = 'core'
  const scope = 'patch-requests'
  interact(domain, user, scope, patch)
})

export default async function patch(newId, patchRequest) {
  patchRequests[newId] = patchRequest

  return new Promise(resolve => {
    //  TODO: configure something like timeout
    patchResponses[newId] = ({ swaps }) => {
      delete patchRequests[newId]
      resolve(swaps)
    }
  })
}