import { JSONCodec, connect } from "https://deno.land/x/nats@v1.28.0/src/mod.ts"
import { applyPatch } from './utils.js'
import initializationState  from './initialization-state.js'

const client = await connect({ server: '0.0.0.0:4222' })

const jsm = await client.jetstreamManager()
const js = client.jetstream()
const jsonCodec = JSONCodec()

const initializationsPublished = {}

export async function publish(id, update) {
  await js.publish(id, jsonCodec.encode(update))
}

export async function publishInitializationIfNecessary(id, scope, user, domain) {
  if (initializationsPublished[scope]) return initializationsPublished[scope]

  let resolve
  initializationsPublished[scope] = new Promise(r => resolve = r)

  await jsm.streams.add({ name: id }).catch(error => console.log('STREAM ALREADY ADDED???', error))

  const value = initializationState(domain, user, scope)
  const update = jsonCodec.encode({
    domain,
    user,
    scope: id,
    ii:0,
    patch: [{ op: 'add', path: [], value }]
  })
  const options = { expect: { lastSubjectSequence: 0 } }
  await js.publish(id, update, options).catch(() => {}) //  TODO: consider if should track...

  resolve()
}

function patchToActiveInside(patch) {
  return patch.find(p => p.path[0] === 'active')
}

export async function subscribe(id, callback, scope) {
  //  TODO: the await here is making it so we might have more updates than expected pushed onto the queue
  const c = await js.consumers.get(id)
  let { num_pending } = await c.info()

  const messages = await c.consume({ max_messages: 1000 })

  const history = []

  if (num_pending === 0) {
    console.log('NUM PENDING IS ZEEEEEEEEEEEEEEEEERO!!!!!!!!!!!!!!!!')
    num_pending = 1 // at least the initialization message has been published
  }

  ;(async () => {
    for await (const m of messages) {
      try {
        const update = jsonCodec.decode(m.data)
        if (num_pending) {
          history.push(update.patch)
          num_pending -= 1
          if (!num_pending) {
            let state = {}
            history
              .forEach(patch => {
                const lastResetPatchIndex = patch.findLastIndex(p => p.path.length === 0)
                if (lastResetPatchIndex > -1) state = patch[lastResetPatchIndex].value

                const patchesToApply = patch.slice(lastResetPatchIndex + 1)
                if (patchesToApply.length && !state.active && patchToActiveInside(patchesToApply)) state.active = {}
                state = applyPatch(state, patchesToApply)
              }
            )
            callback({ history, scope, state })
          }
        }
        else callback({ ...update, scope })
      }
      catch (error) {
        //  TODO: deal with different messages other than JSON ones
        console.log('ERROR PROCESSING UPDATE', error, m.data)
      }
      m.ack()
    }
  })()

  return function unsubscribe() {
    //  TODO: unsubscribe logic
    //  TODO: clean up subscriptions when no more subscribers
  }
}
