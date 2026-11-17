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
  policy.advance(119_999)
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
  policy.advance(119_999)
  const release = policy.connectionOpened()
  policy.advance(120_000)
  assert.equal(policy.shouldRestart(), false)
  release()
  policy.advance(119_999)
  assert.equal(policy.shouldRestart(), false)
  policy.advance(1)
  assert.equal(policy.shouldRestart(), true)
})

test('an existing longer reconnection grace extends the idle interval', async context => {
  const policy = await start(context)
  policy.advance(TWO_HOURS)
  policy.connectionOpened()()
  policy.advance(180_999)
  assert.equal(policy.shouldRestart('180000'), false)
  policy.advance(1)
  assert.equal(policy.shouldRestart('180000'), true)
  assert.equal(policy.shouldRestart('invalid'), false)
})
