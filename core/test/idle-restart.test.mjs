import test from 'node:test'
import assert from 'node:assert/strict'

const TWO_HOURS = 2 * 60 * 60 * 1000
let nextFixture = 0

async function start(context) {
  let time = 0
  context.mock.method(performance, 'now', () => time)
  const policy = await import(`../source/idle-restart.js?test=${++nextFixture}`)
  return { ...policy, advance: duration => { time += duration } }
}

test('an unused server becomes eligible only after two hours', async context => {
  const policy = await start(context)
  policy.advance(TWO_HOURS - 1)
  assert.equal(policy.shouldRestart(), false)
  policy.advance(1)
  assert.equal(policy.shouldRestart(), true)
})

test('all external transports must close, including unauthenticated connections', async context => {
  const policy = await start(context)
  const first = policy.connectionOpened()
  const second = policy.connectionOpened()
  policy.advance(TWO_HOURS)
  assert.equal(policy.shouldRestart(), false)
  first()
  assert.equal(policy.shouldRestart(), false)
  second()
  policy.advance(60_000)
  assert.equal(policy.shouldRestart(), false)
  policy.advance(4999)
  assert.equal(policy.shouldRestart(), false)
  policy.advance(1)
  assert.equal(policy.shouldRestart(), true)
  second()
  assert.equal(policy.shouldRestart(), true)
})

test('a reconnect starts a fresh continuous idle interval', async context => {
  const policy = await start(context)
  policy.advance(TWO_HOURS)
  policy.connectionOpened()()
  policy.advance(64_999)
  const release = policy.connectionOpened()
  policy.advance(65_000)
  assert.equal(policy.shouldRestart(), false)
  release()
  policy.advance(64_999)
  assert.equal(policy.shouldRestart(), false)
  policy.advance(1)
  assert.equal(policy.shouldRestart(), true)
})

for (const reconnectionInterval of ['65000', '90000', '180000']) {
  test(`an existing ${reconnectionInterval}ms reconnection grace extends the idle interval`, async context => {
    const policy = await start(context)
    policy.advance(TWO_HOURS)
    policy.connectionOpened()()
    policy.advance(Number(reconnectionInterval) + 999)
    assert.equal(policy.shouldRestart(reconnectionInterval), false)
    policy.advance(1)
    assert.equal(policy.shouldRestart(reconnectionInterval), true)
    assert.equal(policy.shouldRestart('invalid'), false)
  })
}
