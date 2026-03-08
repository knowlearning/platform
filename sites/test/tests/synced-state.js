function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createHiddenIframe() {
  const iframe = document.createElement('iframe')
  iframe.style = 'border: none; width: 0; height: 0;'
  document.body.appendChild(iframe)
  return iframe
}

export default function () {
  describe('Synced State', function () {

    it('External updates are applied to a synced state', async function () {
      const id = uuid()
      const { auth: { user: agent2User }, domain: agent2Domain } = await Agent2.environment()
      const state2 = await Agent2.state(id)
      state2.x = 0
      await Agent2.synced()

      let resolveDone
      const done = new Promise(r => resolveDone = r)

      const state = await Agent.state(id, agent2User, agent2Domain).synced(updated => {
        if (updated.x === 42) resolveDone()
      })

      state2.x = 42
      await done

      expect(state.x).to.equal(42)
    })

    it('Callback receives (state, patch) on each external update', async function () {
      const id = uuid()
      const { auth: { user: agent2User }, domain: agent2Domain } = await Agent2.environment()
      const state2 = await Agent2.state(id)
      await Agent2.synced()

      let resolveGotCallback
      const gotCallback = new Promise(r => resolveGotCallback = r)
      let callbackState, callbackPatch

      await Agent.state(id, agent2User, agent2Domain).synced((s, p) => {
        callbackState = s
        callbackPatch = p
        resolveGotCallback()
      })

      state2.foo = 'bar'
      await gotCallback

      expect(callbackState.foo).to.equal('bar')
      expect(callbackPatch.some(op => op.path[0] === 'foo')).to.equal(true)
    })

    it('Multiple .synced() calls register callbacks but only one watcher', async function () {
      const id = uuid()
      const { auth: { user: agent2User }, domain: agent2Domain } = await Agent2.environment()
      const state2 = await Agent2.state(id)
      await Agent2.synced()

      let cb1Count = 0, cb2Count = 0
      let resolveDone
      const done = new Promise(r => resolveDone = r)

      await Agent
        .state(id, agent2User, agent2Domain)
        .synced(() => { cb1Count++ })
        .synced(() => {
          cb2Count++
          resolveDone()
        })

      state2.val = 1
      await done

      expect(cb1Count).to.equal(1)
      expect(cb2Count).to.equal(1)
    })

    it('Local mutations still persist after being synced', async function () {
      const id = uuid()
      const { auth: { user: agentUser }, domain: agentDomain } = await Agent.environment()

      const state = await Agent.state(id).synced()
      state.local = 'mutation'
      await Agent.synced()

      const state3 = await Agent3.state(id, agentUser, agentDomain)
      expect(state3.local).to.equal('mutation')
    })

    it('Synced callback receives a faithful server-state snapshot, not the live proxy', async function () {
      const id = uuid()
      const snapshots = []

      const state = await Agent.state(id).synced(s => snapshots.push(s))

      state.x = 'first'
      await Agent.synced()  // 'first' ACK'd; echo in flight (macrotask)

      state.x = 'second'   // synchronous — runs before echo arrives
      await Agent.synced()
      await pause(200)      // both echoes arrive and callbacks fire

      // Bug:  s IS resolvedProxy. Both snapshots point to the same live proxy.
      //       After echoes settle, proxy.x === 'second'. snapshots[0].x === 'second'.
      //       expect('second').to.equal('first') → FAILS.
      // Fix:  s is a structuredClone of server state at time of echo.
      //       snapshots[0] = { x: 'first' }, snapshots[1] = { x: 'second' }.
      expect(snapshots[0].x).to.equal('first')
      expect(snapshots[1].x).to.equal('second')
    })

    it('Synced proxy is not modified by own-mutation echoes (proxy value stable in callbacks)', async function () {
      const id = uuid()
      const proxyValuesAtCallback = []

      const state = await Agent.state(id).synced(() => {
        proxyValuesAtCallback.push(state.x)  // read proxy, not callback arg
      })

      state.x = 'first'
      await Agent.synced()  // echo in flight; 'second' set synchronously before it arrives

      state.x = 'second'
      await Agent.synced()
      await pause(200)

      expect(proxyValuesAtCallback).to.deep.equal(['first', 'second'])
    })

    it('Array is not corrupted and callback receives faithful state when own push is echoed', async function () {
      const id = uuid()
      let callbackArg

      const state = await Agent.state(id).synced(s => { callbackArg = s.items.slice() })

      state.items = []
      await Agent.synced()
      await pause(100)  // let echo for items=[] settle (idempotent for arrays)

      state.items.push('a')  // generates: { op: 'add', path: ['items', 0], value: 'a' }
      await Agent.synced()
      await pause(200)        // echo arrives; re-applies add at index 0 — inserts again

      // Bug:  items proxy becomes ['a', 'a']. Callback receives proxy so sees ['a', 'a'].
      //       Both assertions fail.
      // Fix:  proxy unchanged (['a']). Callback receives server snapshot (['a']).
      //       Both pass.
      expect(state.items).to.deep.equal(['a'])
      expect(callbackArg).to.deep.equal(['a'])
    })

    it('Nested object set externally remains mutable and persistent', async function () {
      const id = uuid()
      const { auth: { user: agentUser }, domain: agentDomain } = await Agent.environment()

      let resolveSynced
      const syncedOnce = new Promise(r => resolveSynced = r)

      // Use Agent's own scope. PatchProxy wraps nested objects in child proxies
      // when they are first set (set trap). This verifies that the child proxy
      // created at write time remains mutable and connected after the echo fires.
      const state = await Agent.state(id).synced(updated => {
        if (updated.nested) resolveSynced()
      })

      state.nested = { x: 1 }
      await syncedOnce   // wait for echo to arrive and be applied via sync watcher

      state.nested.x = 2
      await Agent.synced()

      const state3 = await Agent3.state(id, agentUser, agentDomain)
      expect(state3.nested.x).to.equal(2)
    })

    it('Batched synchronous mutations produce a single echo callback', async function () {
      const id = uuid()
      let callbackCount = 0
      let lastSnapshot

      const state = await Agent.state(id).synced(s => {
        callbackCount++
        lastSnapshot = s
      })

      state.a = 1
      state.b = 2
      state.c = 3
      await Agent.synced()
      await pause(200)

      expect(callbackCount).to.equal(1)
      expect(lastSnapshot.a).to.equal(1)
      expect(lastSnapshot.b).to.equal(2)
      expect(lastSnapshot.c).to.equal(3)
      expect(state.a).to.equal(1)
      expect(state.b).to.equal(2)
      expect(state.c).to.equal(3)
    })

    it('Sequential (async-separated) mutations produce separate echo callbacks', async function () {
      const id = uuid()
      const snapshots = []

      const state = await Agent.state(id).synced(s => {
        snapshots.push(s.x)
      })

      state.x = 'one'
      await Agent.synced()
      await pause(200)

      state.x = 'two'
      await Agent.synced()
      await pause(200)

      expect(snapshots.length).to.equal(2)
      expect(snapshots[0]).to.equal('one')
      expect(snapshots[1]).to.equal('two')
    })

    it('Multiple synced scopes do not interfere', async function () {
      const id1 = uuid()
      const id2 = uuid()
      const scope1Snapshots = []
      const scope2Snapshots = []

      const state1 = await Agent.state(id1).synced(s => {
        scope1Snapshots.push({ ...s })
      })
      const state2 = await Agent.state(id2).synced(s => {
        scope2Snapshots.push({ ...s })
      })

      state1.a = 'scope1'
      state2.b = 'scope2'
      await Agent.synced()
      await pause(200)

      expect(scope1Snapshots.length).to.equal(1)
      expect(scope2Snapshots.length).to.equal(1)
      expect(scope1Snapshots[0].a).to.equal('scope1')
      expect(scope1Snapshots[0].b).to.equal(undefined)
      expect(scope2Snapshots[0].b).to.equal('scope2')
      expect(scope2Snapshots[0].a).to.equal(undefined)
    })

    it('Own mutation followed by external update on same property', async function () {
      const id = uuid()
      const { auth: { user: agent2User }, domain: agent2Domain } = await Agent2.environment()

      const state2 = await Agent2.state(id)
      state2.x = 'initial'
      await Agent2.synced()

      let resolveExternal
      const gotExternal = new Promise(r => resolveExternal = r)

      const state = await Agent.state(id, agent2User, agent2Domain).synced(updated => {
        if (updated.x === 'external') resolveExternal()
      })

      // External update by owner
      state2.x = 'external'
      await gotExternal

      expect(state.x).to.equal('external')
    })

    it('synced() without callback still prevents proxy corruption', async function () {
      const id = uuid()
      const { auth: { user: agentUser }, domain: agentDomain } = await Agent.environment()

      const state = await Agent.state(id).synced()

      state.items = ['a']
      await Agent.synced()
      await pause(200)

      state.items.push('b')
      await Agent.synced()
      await pause(200)

      expect(state.items).to.deep.equal(['a', 'b'])

      // Verify via third-party read
      const state3 = await Agent3.state(id, agentUser, agentDomain)
      expect(state3.items).to.deep.equal(['a', 'b'])
    })

    it('Agent.synced() with no pending mutations resolves immediately', async function () {
      const id = uuid()
      const state = await Agent.state(id).synced()

      // No mutations — should resolve without hanging
      await Agent.synced()
    })

    it('Callback state snapshot is independent (not shared reference)', async function () {
      const id = uuid()
      const snapshots = []

      const state = await Agent.state(id).synced(s => {
        snapshots.push(s)
      })

      state.x = 'first'
      await Agent.synced()
      await pause(200)

      // Mutate the captured snapshot
      snapshots[0].x = 'MUTATED'
      snapshots[0].extra = 'INJECTED'

      state.x = 'second'
      await Agent.synced()
      await pause(200)

      // Proxy should not be affected by snapshot mutation
      expect(state.x).to.equal('second')
      expect(state.extra).to.equal(undefined)

      // Second snapshot should be independent
      expect(snapshots[1].x).to.equal('second')
      expect(snapshots[1].extra).to.equal(undefined)
    })

    it('Rapid mutations to same property — last value wins', async function () {
      const id = uuid()
      const { auth: { user: agentUser }, domain: agentDomain } = await Agent.environment()
      const snapshots = []

      const state = await Agent.state(id).synced(s => {
        snapshots.push(s.x)
      })

      state.x = 1
      state.x = 2
      state.x = 3
      await Agent.synced()
      await pause(200)

      expect(snapshots.length).to.equal(1)
      expect(snapshots[0]).to.equal(3)
      expect(state.x).to.equal(3)

      // Verify via third-party read
      const state3 = await Agent3.state(id, agentUser, agentDomain)
      expect(state3.x).to.equal(3)
    })

    it('Delete property echoed correctly', async function () {
      const id = uuid()
      const { auth: { user: agentUser }, domain: agentDomain } = await Agent.environment()

      const state = await Agent.state(id).synced()

      state.temp = 'exists'
      await Agent.synced()
      await pause(200)
      expect(state.temp).to.equal('exists')

      delete state.temp
      await Agent.synced()
      await pause(200)

      expect(state.temp).to.equal(undefined)
      expect('temp' in state).to.equal(false)

      // Verify via third-party read
      const state3 = await Agent3.state(id, agentUser, agentDomain)
      expect(state3.temp).to.equal(undefined)
    })

    it('Nested object mutation echoed without corruption', async function () {
      const id = uuid()
      const { auth: { user: agentUser }, domain: agentDomain } = await Agent.environment()
      const snapshots = []

      const state = await Agent.state(id).synced(s => {
        snapshots.push(structuredClone(s))
      })

      state.obj = { a: 1 }
      await Agent.synced()
      await pause(200)

      state.obj.a = 2
      await Agent.synced()
      await pause(200)

      expect(state.obj.a).to.equal(2)
      expect(snapshots.length).to.equal(2)
      expect(snapshots[0].obj.a).to.equal(1)
      expect(snapshots[1].obj.a).to.equal(2)

      // Verify via third-party read
      const state3 = await Agent3.state(id, agentUser, agentDomain)
      expect(state3.obj.a).to.equal(2)
    })

    it('External-only updates still trigger callbacks (no own echo involvement)', async function () {
      const id = uuid()
      const { auth: { user: agent2User }, domain: agent2Domain } = await Agent2.environment()

      const state2 = await Agent2.state(id)
      state2.init = true
      await Agent2.synced()

      const snapshots = []
      let resolveDone
      const done = new Promise(r => resolveDone = r)

      await Agent.state(id, agent2User, agent2Domain).synced(s => {
        snapshots.push({ ...s })
        if (s.count === 2) resolveDone()
      })

      // Agent never mutates — only Agent2 sends updates
      state2.count = 1
      await Agent2.synced()
      await pause(100)

      state2.count = 2
      await done

      expect(snapshots.length).to.equal(2)
      expect(snapshots[0].count).to.equal(1)
      expect(snapshots[1].count).to.equal(2)
    })

    it('Callback can be added after synced() activates the watcher', async function () {
      const id = uuid()
      const { auth: { user: agent2User }, domain: agent2Domain } = await Agent2.environment()
      const state2 = await Agent2.state(id)
      const statePromise = Agent.state(id, agent2User, agent2Domain)

      await statePromise.synced()

      const gotCallback = deferred()
      statePromise.synced((s, p) => gotCallback.resolve({ state: s, patch: p }))

      state2.late = true
      const { state, patch } = await gotCallback.promise

      expect(state.late).to.equal(true)
      expect(patch).to.deep.equal([{ op: 'add', path: ['late'], value: true }])
    })

    it('Independent synced proxies for the same scope both receive external updates', async function () {
      const id = uuid()
      const { auth: { user: agent2User }, domain: agent2Domain } = await Agent2.environment()
      const owner = await Agent2.state(id)
      const observer1Snapshots = []
      const observer2Snapshots = []
      const done = deferred()

      await Agent.state(id, agent2User, agent2Domain).synced(s => {
        observer1Snapshots.push(s.count)
      })
      await Agent3.state(id, agent2User, agent2Domain).synced(s => {
        observer2Snapshots.push(s.count)
        if (s.count === 2) done.resolve()
      })

      owner.count = 1
      await Agent2.synced()
      await pause(100)

      owner.count = 2
      await done.promise

      expect(observer1Snapshots).to.deep.equal([1, 2])
      expect(observer2Snapshots).to.deep.equal([1, 2])
    })

    it('Callback patch paths are active-stripped for nested add, remove, and array updates', async function () {
      const id = uuid()
      const { auth: { user: agent2User }, domain: agent2Domain } = await Agent2.environment()
      const state2 = await Agent2.state(id)
      const patches = []
      const done = deferred()

      await Agent.state(id, agent2User, agent2Domain).synced((_, patch) => {
        patches.push(patch)
        if (patches.length === 4) done.resolve()
      })

      state2.obj = {}
      await Agent2.synced()
      state2.obj.deep = 1
      await Agent2.synced()
      delete state2.obj.deep
      await Agent2.synced()
      state2.items = ['a']
      await done.promise

      expect(patches[0]).to.deep.equal([{ op: 'add', path: ['obj'], value: {} }])
      expect(patches[1]).to.deep.equal([{ op: 'add', path: ['obj', 'deep'], value: 1 }])
      expect(patches[2]).to.deep.equal([{ op: 'remove', path: ['obj', 'deep'] }])
      expect(patches[3]).to.deep.equal([{ op: 'add', path: ['items'], value: ['a'] }])
      patches.flat().forEach(({ path }) => expect(path[0]).to.not.equal('active'))
    })

    it('Deep snapshot mutation does not affect the proxy or later snapshots', async function () {
      const id = uuid()
      const snapshots = []

      const state = await Agent.state(id).synced(s => {
        snapshots.push(JSON.parse(JSON.stringify(s)))
      })

      state.tree = { branch: { leaf: 1 }, items: ['a'] }
      await Agent.synced()
      await pause(200)

      snapshots[0].tree.branch.leaf = 999
      snapshots[0].tree.items.push('b')
      snapshots[0].tree.injected = true

      state.tree.branch.leaf = 2
      await Agent.synced()
      await pause(200)

      expect(state.tree.branch.leaf).to.equal(2)
      expect(state.tree.items).to.deep.equal(['a'])
      expect(state.tree.injected).to.equal(undefined)
      expect(snapshots[1].tree.branch.leaf).to.equal(2)
      expect(snapshots[1].tree.items).to.deep.equal(['a'])
      expect(snapshots[1].tree.injected).to.equal(undefined)
    })

    it('Microtask-separated mutations produce separate echo callbacks', async function () {
      const id = uuid()
      const snapshots = []

      const state = await Agent.state(id).synced(s => {
        snapshots.push(s.x)
      })

      state.x = 'one'
      await Promise.resolve()
      state.x = 'two'
      await Agent.synced()
      await pause(200)

      expect(snapshots).to.deep.equal(['one', 'two'])
    })

    it('Agent.synced() waits for pending own echoes across multiple synced scopes', async function () {
      const id1 = uuid()
      const id2 = uuid()
      const snapshots1 = []
      const snapshots2 = []

      const state1 = await Agent.state(id1).synced(s => snapshots1.push({ ...s }))
      const state2 = await Agent.state(id2).synced(s => snapshots2.push({ ...s }))

      state1.a = 1
      state2.b = 2
      await Agent.synced()

      expect(snapshots1).to.deep.equal([{ a: 1 }])
      expect(snapshots2).to.deep.equal([{ b: 2 }])
    })

    it('External replacement of the active state updates callback snapshot and proxy', async function () {
      const id = uuid()
      const { auth: { user: agent2User }, domain: agent2Domain } = await Agent2.environment()
      // ensure Agent2 owns the state
      await Agent2.state(id)

      const observer = await Agent.state(id, agent2User, agent2Domain).synced()
      const received = deferred()

      await Agent.state(id, agent2User, agent2Domain).synced((s, p) => {
        if (s.replaced) received.resolve({ state: s, patch: p })
      })

      await Agent2.interact(id, [{ op: 'add', path: [], value: { replaced: true, count: 1 } }])
      const { state, patch } = await received.promise

      await Agent.synced()

      expect(state).to.deep.equal({ replaced: true, count: 1 })
      expect(patch).to.deep.equal([{ op: 'add', path: [], value: { replaced: true, count: 1 } }])
      expect(observer.replaced).to.equal(true)
      expect(observer.count).to.equal(1)
    })

    it('Own update followed by external overwrite on the same property preserves callback order', async function () {
      const id = uuid()
      const snapshots = []
      const localState = await Agent.state(id).synced(s => {
        snapshots.push(s.x)
      })
      const externalState = await Agent2.state(id)

      localState.x = 'local'
      await Agent.synced()

      externalState.x = 'external'
      await Agent2.synced()
      await pause(200)

      expect(snapshots).to.deep.equal(['local', 'external'])
      expect(localState.x).to.equal('external')
    })

    it('External update followed by own overwrite on the same property preserves callback order', async function () {
      const id = uuid()
      const snapshots = []
      const externalState = await Agent2.state(id)
      const localState = await Agent.state(id).synced(s => {
        snapshots.push(s.x)
      })

      externalState.x = 'external'
      await Agent2.synced()
      await pause(100)

      localState.x = 'local'
      await Agent.synced()

      expect(snapshots).to.deep.equal(['external', 'local'])
      expect(localState.x).to.equal('local')
    })

    it('Multiple array pushes in one synchronous batch produce one callback with the final array', async function () {
      const id = uuid()
      const snapshots = []
      const state = await Agent.state(id).synced(s => {
        snapshots.push(s.items ? s.items.slice() : s.items)
      })

      state.items = []
      await Agent.synced()
      await pause(100)

      state.items.push('a')
      state.items.push('b')
      await Agent.synced()

      expect(snapshots[snapshots.length - 1]).to.deep.equal(['a', 'b'])
      expect(state.items).to.deep.equal(['a', 'b'])
    })

    it('Replacing values across primitive, object, and array shapes remains stable', async function () {
      const id = uuid()
      const snapshots = []
      const state = await Agent.state(id).synced(s => {
        snapshots.push(JSON.parse(JSON.stringify(s.value)))
      })

      state.value = 'alpha'
      await Agent.synced()
      await pause(100)

      state.value = { nested: 1 }
      await Agent.synced()
      await pause(100)

      state.value = [1, 2, 3]
      await Agent.synced()
      await pause(100)

      expect(snapshots).to.deep.equal([
        'alpha',
        { nested: 1 },
        [1, 2, 3]
      ])
      expect(state.value).to.deep.equal([1, 2, 3])
    })

  })

  describe('Synced State - Embedded Agents', function () {

    it('Embedded agent syncs to parent updates', async function () {
      this.timeout(5000)
      const scopeId = uuid()
      const parentState = await Agent.state(scopeId)

      const iframe = document.createElement('iframe')
      iframe.style = 'border: none; width: 0; height: 0;'
      document.body.appendChild(iframe)

      let resolveClose
      const closed = new Promise(r => resolveClose = r)
      let closeValue

      const { on } = Agent.embed({ id: `synced-embed-test/${scopeId}`, mode: 'SYNCED_PARENT_TO_EMBED' }, iframe)

      on('close', value => {
        closeValue = value
        document.body.removeChild(iframe)
        resolveClose()
      })

      on('open', async () => {
        await Agent.synced()
        await pause(50)  // let embedded register its sync watcher
        parentState.x = 99
        parentState.done = true
      })

      await closed
      expect(closeValue).to.equal(99)
    })

    it('Embedded agent callback receives parent patch and snapshot', async function () {
      this.timeout(5000)
      const scopeId = uuid()
      const parentState = await Agent.state(scopeId)
      const iframe = createHiddenIframe()
      const closed = deferred()
      let closeValue

      const { on } = Agent.embed({ id: `synced-embed-test/${scopeId}`, mode: 'SYNCED_PARENT_TO_EMBED_PATCH' }, iframe)

      on('close', value => {
        closeValue = value
        document.body.removeChild(iframe)
        closed.resolve()
      })

      on('open', async () => {
        await Agent.synced()
        await pause(50)
        parentState.x = 101
        parentState.done = true
      })

      await closed.promise
      expect(closeValue.x).to.equal(101)
      expect(closeValue.patch).to.deep.equal([
        { op: 'add', path: ['x'], value: 101 },
        { op: 'add', path: ['done'], value: true }
      ])
    })

    it('Parent syncs to embedded agent updates', async function () {
      this.timeout(5000)
      const scopeId = uuid()

      let callbackPatch
      const synced = deferred()

      const parentState = await Agent.state(scopeId).synced((updated, patch) => {
        if (updated.x === 42) {
          callbackPatch = patch
          synced.resolve()
        }
      })

      const iframe = createHiddenIframe()

      const closed = deferred()

      const { on } = Agent.embed({ id: `synced-embed-test/${scopeId}`, mode: 'SYNCED_EMBED_TO_PARENT' }, iframe)

      on('close', () => {
        document.body.removeChild(iframe)
        closed.resolve()
      })

      await Promise.all([closed.promise, synced.promise])
      expect(parentState.x).to.equal(42)
      expect(callbackPatch).to.deep.equal([{ op: 'add', path: ['x'], value: 42 }])
    })

    it('Embedded batched synchronous local writes produce one callback', async function () {
      this.timeout(5000)
      const scopeId = uuid()
      const iframe = createHiddenIframe()
      const closed = deferred()
      let closeValue

      const { on } = Agent.embed({ id: `synced-embed-test/${scopeId}`, mode: 'SYNCED_EMBED_BATCHED_LOCAL' }, iframe)

      on('close', value => {
        closeValue = value
        document.body.removeChild(iframe)
        closed.resolve()
      })

      await closed.promise
      expect(closeValue.callbackCount).to.equal(1)
      expect(closeValue.snapshot).to.deep.equal({ a: 1, b: 2, c: 3 })
      expect(closeValue.proxy).to.deep.equal({ a: 1, b: 2, c: 3 })
    })

    it('Embedded async-separated local writes produce separate callbacks', async function () {
      this.timeout(5000)
      const scopeId = uuid()
      const iframe = createHiddenIframe()
      const closed = deferred()
      let closeValue

      const { on } = Agent.embed({ id: `synced-embed-test/${scopeId}`, mode: 'SYNCED_EMBED_ASYNC_LOCAL' }, iframe)

      on('close', value => {
        closeValue = value
        document.body.removeChild(iframe)
        closed.resolve()
      })

      await closed.promise
      expect(closeValue.snapshots).to.deep.equal(['one', 'two'])
      expect(closeValue.proxy).to.equal('two')
    })

    it('Embedded own echo does not corrupt arrays and callback receives faithful state', async function () {
      this.timeout(5000)
      const scopeId = uuid()
      const iframe = createHiddenIframe()
      const closed = deferred()
      let closeValue

      const { on } = Agent.embed({ id: `synced-embed-test/${scopeId}`, mode: 'SYNCED_EMBED_ARRAY_LOCAL' }, iframe)

      on('close', value => {
        closeValue = value
        document.body.removeChild(iframe)
        closed.resolve()
      })

      await closed.promise
      expect(closeValue.proxy).to.deep.equal(['a'])
      expect(closeValue.callbackArg).to.deep.equal(['a'])
    })

  })

}
