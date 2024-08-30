export const pending = new Set()

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
  let cleanUp
  const sideEffectHandled = new Promise((resolve, reject) => {
    cleanUp = () => {
      subscription.unsubscribe()
      pending.delete(sideEffectHandled)
    }
    const subscription = nc.subscribe(`responses.${subject}`, {
      callback: async (error, message) => {
        if (error) {
          callback(error)
          reject(error)
        }
        else {
          const response = message.json()
          callback(null, response)
          resolve(message.json())
        }
        cleanUp()
      }
    })
  })
  const p = client.publish(subject, message, options)
  pending.add(sideEffectHandled)
  return p.catch(error => {
    if (error.api_error?.err_code === 10071) {
      //  sequence expectation missed
      cleanUp()
    }
    throw error
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
