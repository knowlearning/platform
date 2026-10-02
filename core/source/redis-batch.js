const BATCH_SIZE = 1000

export async function redisBatch(client, entries, enqueue) {
  const replies = []

  for (let offset = 0; offset < entries.length; offset += BATCH_SIZE) {
    const pipeline = client.multi()

    entries.slice(offset, offset + BATCH_SIZE).forEach(entry => enqueue(pipeline, entry))
    replies.push(...await pipeline.execAsPipeline())
  }

  return replies
}
