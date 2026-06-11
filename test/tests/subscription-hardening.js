const loadRedisDiagnostics = async () => {
  const dynamicImport = Function('specifier', 'return import(specifier)')
  return dynamicImport(`file://${process.cwd()}/utils/redis-diagnostics.node.js`)
}

async function corruptAsString(redis, id) {
  await redis.command('default', ['DEL', id])
  await redis.command('default', ['SET', id, 'not-json-state'])
}

async function restoreJSON(redis, id, state) {
  const payload = typeof state === 'string' ? state : JSON.stringify(state)
  await redis.command('default', ['DEL', id])
  await redis.command('default', ['JSON.SET', id, '$', payload])
}

async function eventually(fn, { tries=30, delay=25 }={}) {
  let result

  for (let attempt = 0; attempt < tries; attempt += 1) {
    result = await fn()
    if (result) return result
    await pause(delay)
  }

  return result
}

async function expectRejected(promise) {
  try {
    const result = await promise
    throw new Error(`Expected rejection, received ${JSON.stringify(result)}`)
  }
  catch (error) {
    return error
  }
}

export default function subscriptionHardening() {
  describe('Subscription Error Hardening', function () {
    let redis

    before(async function () {
      redis = await loadRedisDiagnostics()
    })

    it('Surfaces initial subscription read errors without overwriting existing state', async function () {
      this.timeout(10000)

      const id = Agent.uuid()
      const expectedModules = {
        keep_one: { title: 'one' },
        keep_two: { title: 'two' }
      }
      const state = await Agent.state(id)
      state.modules = expectedModules
      await Agent.synced()

      const original = await eventually(async () => {
        const snapshot = await redis.jsonGet('default', id)
        return snapshot?.active?.modules ? snapshot : null
      })
      expect(original?.active?.modules).to.deep.equal(expectedModules)

      try {
        await corruptAsString(redis, id)

        const error = await expectRejected(Agent2.state(id))
        expect(error.error).to.be.a('string').and.not.equal('')
      }
      finally {
        await restoreJSON(redis, id, original)
      }

      const persisted = await redis.jsonGet('default', id)
      expect(persisted.active.modules).to.deep.equal(expectedModules)
    })

    it('Retries initial subscription reads that recover quickly', async function () {
      this.timeout(10000)

      const id = Agent.uuid()
      const expectedModules = {
        retry_one: { title: 'one' },
        retry_two: { title: 'two' }
      }
      const state = await Agent.state(id)
      state.modules = expectedModules
      await Agent.synced()

      const original = await eventually(async () => {
        const snapshot = await redis.jsonGet('default', id)
        return snapshot?.active?.modules ? snapshot : null
      })
      expect(original?.active?.modules).to.deep.equal(expectedModules)
      let restorePromise
      let restoreError
      let restoreTimer

      try {
        await corruptAsString(redis, id)
        restoreTimer = setTimeout(() => {
          restorePromise = restoreJSON(redis, id, original).catch(error => {
            restoreError = error
          })
        }, 75)

        const fetched = await Agent2.state(id)
        if (restorePromise) await restorePromise
        if (restoreError) throw restoreError

        expect(fetched.modules).to.deep.equal(expectedModules)
      }
      finally {
        clearTimeout(restoreTimer)
        if (restorePromise) await restorePromise.catch(() => {})
        await restoreJSON(redis, id, original)
      }
    })

    it('Returns an empty active object for valid empty named scopes', async function () {
      const state = await Agent.state(`empty-subscription-${uuid()}`)
      expect(state).to.deep.equal({})
    })
  })
}
