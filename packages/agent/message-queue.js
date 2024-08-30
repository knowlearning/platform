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

export async function publish(id, patch, expectFirstPublish=false, encodingNeeded=true, callback=()=>{}) {
  const message = encodingNeeded ? JSONCodec().encode(patch) : patch
  const options = expectFirstPublish ? { expect: { lastSequence: 0 } } : undefined

  const jsm = await jetstreamManagerPromise
  const info = await jsm.streams.info(id)
  const subject = info.config.subjects[0]
  const nc = await natsClientPromise

  const client = await jetstreamClientPromise
  const sideEffectHandled = new Promise((resolve, reject) => {
    const subscription = nc.subscribe(`responses.${subject}`, {
      callback: async (error, message) => {
        subscription.unsubscribe()
        if (error) {
          callback(error)
          reject(error)
        }
        else {
          const response = message.json()
          callback(null, response)
          resolve(message.json())
        }
      }
    })
  })
  const p = client.publish(subject, message, options)
//  await sideEffectHandled
  return p
}

export async function inspect(subject) {
  const jetstreamManager = await jetstreamManagerPromise
  const { first_ts, last_ts} = (await jetstreamManager.streams.info(subject)).state

  return {
    created: (new Date(first_ts)).getTime(),
    updated: (new Date(last_ts)).getTime()
  }
}
