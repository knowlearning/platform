import { redisBatch } from '../../core/source/redis-batch.js'
import { createUUIDOwnerIndex, domainUUIDSetKey } from '../../core/source/redis-state-index.js'

const OWNER_HASH_KEY = '__knowlearning:uuid-owner-domain'

function memoryRedis() {
  const hashes = new Map()
  const sets = new Map()
  const calls = []
  let membershipFailures = 0

  const client = {
    async hSetNX(key, field, value) {
      calls.push(['HSETNX', key, field, value])
      if (!hashes.has(key)) hashes.set(key, new Map())
      const hash = hashes.get(key)
      if (hash.has(field)) return 0
      hash.set(field, value)
      return 1
    },
    async hGet(key, field) {
      calls.push(['HGET', key, field])
      return hashes.get(key)?.get(field) ?? null
    },
    async hmGet(key, fields) {
      calls.push(['HMGET', key, ...fields])
      return fields.map(field => hashes.get(key)?.get(field) ?? null)
    },
    async sAdd(key, members) {
      calls.push(['SADD', key, members])
      if (membershipFailures > 0) {
        membershipFailures -= 1
        throw new Error('Simulated interrupted domain membership write')
      }
      if (!sets.has(key)) sets.set(key, new Set())
      const set = sets.get(key)
      const before = set.size
      for (const member of Array.isArray(members) ? members : [members]) set.add(member)
      return set.size - before
    },
    multi() {
      const commands = []
      const pipeline = {
        exec() {
          throw new Error('CROSSSLOT transaction is not allowed')
        },
        async execAsPipeline() {
          calls.push(['PIPELINE', commands.length])
          return Promise.all(commands.map(command => command()))
        }
      }

      for (const method of ['hSetNX', 'hGet', 'hmGet', 'sAdd']) {
        pipeline[method] = (...args) => {
          commands.push(() => client[method](...args))
          return pipeline
        }
      }

      return pipeline
    }
  }

  return {
    client,
    calls,
    sets,
    failMembership() {
      membershipFailures += 1
    }
  }
}

async function rejectionOf(promise) {
  try {
    await promise
  }
  catch (error) {
    return error
  }

  throw new Error('Expected operation to reject')
}

export default function redisCluster() {
  describe('Redis Cluster Compatibility', function () {
    it('Keeps the first UUID owner when independent API servers claim concurrently', async function () {
      const redis = memoryRedis()
      const firstIndex = createUUIDOwnerIndex(redis.client)
      const secondIndex = createUUIDOwnerIndex(redis.client)
      const id = uuid()
      const firstDomain = 'first.example.com'
      const secondDomain = 'second.example.com'

      const owners = await Promise.all([
        firstIndex.claim(firstDomain, id),
        secondIndex.claim(secondDomain, id)
      ])

      expect(owners).to.deep.equal([firstDomain, firstDomain])
      expect(await redis.client.hGet(OWNER_HASH_KEY, id)).to.equal(firstDomain)
      expect([...redis.sets.get(domainUUIDSetKey(firstDomain))]).to.deep.equal([id])
      expect(redis.sets.get(domainUUIDSetKey(secondDomain))?.has(id) || false).to.equal(false)
    })

    it('Repairs an interrupted membership write before caching an owner', async function () {
      const redis = memoryRedis()
      const index = createUUIDOwnerIndex(redis.client)
      const id = uuid()
      const domain = 'retry.example.com'
      redis.failMembership()

      const error = await rejectionOf(index.claim(domain, id))
      expect(error.message).to.include('interrupted domain membership')
      expect(await redis.client.hGet(OWNER_HASH_KEY, id)).to.equal(domain)
      expect(redis.sets.has(domainUUIDSetKey(domain))).to.equal(false)

      expect(await index.ownerDomain(id)).to.equal(domain)
      expect(redis.sets.get(domainUUIDSetKey(domain)).has(id)).to.equal(true)

      const successfulCalls = redis.calls.length
      expect(await index.ownerDomain(id)).to.equal(domain)
      expect(redis.calls.length).to.equal(successfulCalls)
    })

    it('Repairs ownership claimed before an API server restart', async function () {
      const redis = memoryRedis()
      const id = uuid()
      const domain = 'restart.example.com'
      await redis.client.hSetNX(OWNER_HASH_KEY, id, domain)

      const index = createUUIDOwnerIndex(redis.client)
      expect(await index.ownerDomain(id)).to.equal(domain)
      expect(redis.sets.get(domainUUIDSetKey(domain)).has(id)).to.equal(true)
      expect(await index.ownerDomain(uuid())).to.equal(null)
    })

    it('Rejects conflicting batch claims without indexing UUIDs in the wrong domain', async function () {
      const redis = memoryRedis()
      const index = createUUIDOwnerIndex(redis.client)
      const existingId = uuid()
      const newId = uuid()
      const existingDomain = 'owner.example.com'
      const requestedDomain = 'migration.example.com'
      await index.claim(existingDomain, existingId)

      const error = await rejectionOf(index.claimBatch(requestedDomain, [newId, existingId]))

      expect(error.message).to.include(existingId).and.include(existingDomain).and.include(requestedDomain)
      expect(await redis.client.hGet(OWNER_HASH_KEY, existingId)).to.equal(existingDomain)
      expect(redis.sets.get(domainUUIDSetKey(requestedDomain))?.has(existingId) || false).to.equal(false)
      expect(await index.ownerDomain(newId)).to.equal(requestedDomain)
      expect(redis.sets.get(domainUUIDSetKey(requestedDomain)).has(newId)).to.equal(true)
    })

    it('Retries interrupted batch membership writes without losing owners', async function () {
      const redis = memoryRedis()
      const index = createUUIDOwnerIndex(redis.client)
      const ids = [uuid(), uuid(), uuid()]
      const domain = 'batch.example.com'
      redis.failMembership()

      const error = await rejectionOf(index.claimBatch(domain, ids))
      expect(error.message).to.include('interrupted domain membership')
      expect(await index.ownerDomain(ids[0])).to.equal(domain)
      expect(redis.sets.get(domainUUIDSetKey(domain)).has(ids[0])).to.equal(true)
      expect(await index.claimBatch(domain, ids)).to.equal(ids.length)
      expect([...redis.sets.get(domainUUIDSetKey(domain))]).to.have.members(ids)
      expect(await Promise.all(ids.map(id => index.ownerDomain(id))))
        .to.deep.equal(ids.map(() => domain))
    })

    it('Pipelines bounded single-key batches while preserving reply order and missing values', async function () {
      const ids = Array.from({ length: 2003 }, (_, index) => `state-${index}`)
      const expected = ids.map((id, index) => index % 7 === 0 ? null : { id, index })
      const values = new Map(ids.map((id, index) => [id, expected[index]]))
      const batchSizes = []
      const client = {
        multi() {
          const pending = []
          return {
            json: {
              get(id, options) {
                expect(options).to.deep.equal({ path: '$.active' })
                pending.push(values.get(id))
              }
            },
            exec() {
              throw new Error('CROSSSLOT transaction is not allowed')
            },
            async execAsPipeline() {
              batchSizes.push(pending.length)
              return pending
            }
          }
        }
      }

      const results = await redisBatch(client, ids, (pipeline, id) => {
        pipeline.json.get(id, { path: '$.active' })
      })

      expect(results).to.deep.equal(expected)
      expect(batchSizes).to.deep.equal([1000, 1000, 3])
      expect(await redisBatch(client, [], () => {})).to.deep.equal([])
      expect(batchSizes).to.deep.equal([1000, 1000, 3])
    })
  })
}
