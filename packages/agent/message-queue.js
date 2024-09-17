export const pending = new Map()

export async function process(id, sequence) {
  const jetstreamManager = await jetstreamManagerPromise
  const jetstreamClient = await jetstreamClientPromise

  const c = await jetstreamClient.consumers.get(id, {
    deliver_policy: "by_start_sequence",
    opt_start_seq: sequence,
    ack_policy: "explicit"
  })
  const { last_seq: historyLength, first_ts } = (await jetstreamManager.streams.info(id)).state
  const messages = await c.consume({ max_messages: 1000 })
  return {
    messages,
    historyLength,
    created: new Date(first_ts).getTime()
  }
}

setTimeout(() => {
  natsClientPromise.then(async nc => {
    //  TODO: scope responses to session rather than domain.user
    const { auth: {user}, domain } = await environment()
    nc.subscribe(`responses.patch.${domain}.${user}.>`, {
      callback: async (error, message) => {
        // TODO: handle error
        const response = message.json()
        const { id, seq } = response
        const responseHash = `${id}#${seq}`
        if (response.error) {
          pending
            .get(responseHash)
            ?.reject({ error: response.error })
        }
        else {
          pending
            .get(responseHash)
            ?.resolve(response.value)
        }
      }
    })
  })
})

const subjectCache = {}

export async function publish(id, patch, expectFirstPublish=false, encodingNeeded=true, callback=()=>{}) {
  const message = encodingNeeded ? JSONCodec().encode(patch) : patch
  const options = expectFirstPublish ? { expect: { lastSequence: 0 } } : undefined

  if (!subjectCache[id]) {
    subjectCache[id] = (async () => {
      const jsm = await jetstreamManagerPromise
      const info = await jsm.streams.info(id)
      if (info.config.subjects.length > 1) {
        console.warn('UNEXPECTED NUMBER OF SUBJECTS FOR', id)
      }
      return info.config.subjects[0]
    })()
  }
  let resolve, reject
  const sideEffectHandled = new Promise((res, rej) => {
    resolve = value => {
      pending.delete(responseHash)
      pending.delete(tmpId)
      callback(null, value)
      res(value)
    }
    reject = error => {
      pending.delete(responseHash)
      pending.delete(tmpId)
      callback(error)
      rej(error)
    }
  })
  const tmpId = uuid()
  let responseHash
  pending.set(tmpId, { promise: sideEffectHandled })

  const subject = await subjectCache[id]
  const client = await jetstreamClientPromise

  return (
    client
      .publish(subject, message, options)
      .then(ack => {
        responseHash = `${id}#${ack.seq}`
        //  TODO: handle case where already received response with responseHash
        pending
          .set(responseHash, {
            promise: sideEffectHandled,
            resolve,
            reject
          })
        return sideEffectHandled
      })
      .catch(error => {
        reject(error)
        return sideEffectHandled
      })
    )
}
