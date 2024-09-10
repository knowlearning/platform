export const pending = new Map()

export async function process(id) {
  const jetstreamManager = await jetstreamManagerPromise
  const jetstreamClient = await jetstreamClientPromise

  const c = await jetstreamClient.consumers.get(id)
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
        console.log('ERROR IN RESPONSE????', response.error)
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

export async function publish(id, patch, expectFirstPublish=false, encodingNeeded=true, callback=()=>{}) {
  const message = encodingNeeded ? JSONCodec().encode(patch) : patch
  const options = expectFirstPublish ? { expect: { lastSequence: 0 } } : undefined

  const jsm = await jetstreamManagerPromise
  const info = await jsm.streams.info(id)
  const subject = info.config.subjects[0]

  const client = await jetstreamClientPromise
  let resolve, reject
  const sideEffectHandled = new Promise((res, rej) => {
    resolve = value => {
      pending.delete(responseHash)
      callback(null, value)
      res(value)
    }
    reject = error => {
      pending.delete(responseHash)
      callback(error)
      rej(error)
    }
  })
  const tmpId = uuid()
  let responseHash
  pending.set(tmpId, { promise: sideEffectHandled })

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
    })
    .catch(error => {
      console.log('GOT ERROR', error)
      //reject(error)
      //throw error
    })
    .finally(() => {
      pending.delete(tmpId)
    })
}

export async function inspect(subject) {
  const jetstreamManager = await jetstreamManagerPromise
  const { first_ts, last_ts} = (await jetstreamManager.streams.info(subject)).state

  return {
    created: (new Date(first_ts)).getTime(),
    updated: (new Date(last_ts)).getTime()
  }
}
