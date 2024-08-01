export async function process(subject) {
  const jetstreamManager = await jetstreamManagerPromise
  const jetstreamClient = await jetstreamClientPromise
  await jetstreamManager.streams.add({ name: subject })

  const c = await jetstreamClient.consumers.get(subject)
  const { last_seq: historyLength, first_ts } = (await jetstreamManager.streams.info(subject)).state
  const messages = await c.consume({ max_messages: 1000 })
  return {
    messages,
    historyLength,
    created: new Date(first_ts).getTime()
  }
}

export async function publish(subject, patch, expectFirstPublish=false, encodingNeeded=true) {
  const message = encodingNeeded ? JSONCodec().encode(patch) : patch
  const client = await jetstreamClientPromise
  let options
  if (expectFirstPublish) {
    const jetstreamManager = await jetstreamManagerPromise
    await jetstreamManager.streams.add({ name: subject })
    options =  { expect: { lastSequence: 0 } }
  }
  await client.publish(subject, message, options)
}

export async function inspect(subject) {
  const jetstreamManager = await jetstreamManagerPromise
  const { first_ts, last_ts} = (await jetstreamManager.streams.info(subject)).state

  return {
    created: (new Date(first_ts)).getTime(),
    updated: (new Date(last_ts)).getTime()
  }
}
