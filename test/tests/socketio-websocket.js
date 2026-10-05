import transportSource from '../../core/vendor/socket_io/websocket.ts?raw'
import denoConfigSource from '../../core/deno.json?raw'

function createHarness() {
  const sockets = []
  const decoded = []
  const parser = {
    encodePacket(packet, supportsBinary, callback) {
      callback(packet.data)
    },
    decodePacket(data) {
      decoded.push(data)
      return { type: 'message', data }
    }
  }

  class Transport {
    constructor(opts) {
      this.opts = opts
      this.readyState = 'open'
      this.writable = false
      this.events = []
      this.listeners = {}
    }

    emitReserved(event, value) {
      this.events.push({ event, value })
      this.listeners[event]?.(value)
    }

    onError(message) {
      const error = new Error(message)
      error.type = 'TransportError'
      this.emitReserved('error', error)
    }

    onData(data) {
      this.emitReserved('packet', parser.decodePacket(data))
    }

    close() {
      if (['closing', 'closed'].includes(this.readyState)) return
      this.readyState = 'closing'
      this.doClose()
    }

    onClose() {
      this.readyState = 'closed'
      this.emitReserved('close')
    }
  }

  const deno = {
    upgradeWebSocket() {
      const socket = {
        readyState: 1,
        closeCalls: 0,
        sent: [],
        send(data) {
          this.sent.push(data)
        },
        close() {
          this.closeCalls += 1
          this.readyState = 2
        },
        finishClose() {
          this.readyState = 3
          this.onclose({ code: 1000 })
        }
      }
      sockets.push(socket)
      return { socket, response: { status: 101 } }
    }
  }

  const WebSocketTransport = new Function(
    'getLogger', 'Transport', 'Parser', 'Deno', 'WebSocket',
    transportSource.replace(/^import .*$/gm, '').replace('export class WS', 'class WS')
      .replace(/\b(public|private|protected) /g, '')
      .replace('socket?: WebSocket;', 'socket;')
      .replace('get upgradesTo(): string[]', 'get upgradesTo()')
      .replace('send(packets: Packet[])', 'send(packets)')
      .replace('(data: RawData)', '(data)')
      .replace('onRequest(req: Request): Promise<Response>', 'onRequest(req)')
      + '\nreturn WS'
  )(() => ({ debug() {} }), Transport, parser, deno, { OPEN: 1 })

  async function connect({ established=true, maxHttpBufferSize=1024 }={}) {
    const transport = new WebSocketTransport({ maxHttpBufferSize })
    if (established) transport.listeners.error = () => transport.close()
    const response = await transport.onRequest({})
    const socket = sockets.at(-1)
    socket.onopen()
    return { transport, socket, response }
  }

  return { connect, decoded, WebSocketTransport }
}

export default function socketioWebsocket() {
  describe('Socket.IO WebSocket transport', function () {
    it('Maps the pinned upstream transport to the local patch', function () {
      const config = JSON.parse(denoConfigSource)
      expect(config.imports[
        'https://deno.land/x/socket_io@0.2.1/packages/engine.io/lib/transports/websocket.ts'
      ]).to.equal('./vendor/socket_io/websocket.ts')
    })

    it('Initializes its own undefined socket field before receiving a request', function () {
      const { WebSocketTransport } = createHarness()
      const transport = new WebSocketTransport({ maxHttpBufferSize: 1024 })

      expect(transport).to.have.own.property('socket')
      expect(transport.socket).to.equal(undefined)
    })

    for (const established of [true, false]) {
      for (const [label, data] of [['null', null], ['undefined', undefined]]) {
        it(`Closes ${established ? 'an established transport' : 'a pending upgrade'} once on ${label} data`, async function () {
          const harness = createHarness()
          const { transport, socket } = await harness.connect({ established })
          const healthy = await harness.connect()

          expect(() => socket.onmessage({ data })).not.to.throw()
          expect(harness.decoded).to.deep.equal([])
          expect(transport.events.filter(({ event }) => event === 'error')).to.have.length(1)
          const failure = transport.events.find(({ event }) => event === 'error').value
          expect(failure.type).to.equal('TransportError')
          expect(failure.message).to.equal('invalid WebSocket message data')
          expect(transport.readyState).to.equal('closing')
          expect(socket.closeCalls).to.equal(1)

          for (const lateData of [null, undefined, '4late']) {
            expect(() => socket.onmessage({ data: lateData })).not.to.throw()
          }
          socket.finishClose()
          for (const lateData of [null, undefined, '4late']) {
            expect(() => socket.onmessage({ data: lateData })).not.to.throw()
          }
          expect(transport.readyState).to.equal('closed')
          expect(transport.writable).to.equal(false)
          expect(socket.closeCalls).to.equal(1)
          expect(transport.events.filter(({ event }) => event === 'close')).to.have.length(1)
          expect(transport.events.filter(({ event }) => event === 'error')).to.have.length(1)
          expect(harness.decoded).to.deep.equal([])

          healthy.socket.onmessage({ data: '4healthy' })
          healthy.transport.send([{ type: 'message', data: 'healthy response' }])
          expect(harness.decoded).to.deep.equal(['4healthy'])
          expect(healthy.socket.sent).to.deep.equal(['healthy response'])
          expect(healthy.socket.closeCalls).to.equal(0)
          expect(healthy.transport.readyState).to.equal('open')
        })
      }
    }

    it('Passes text and binary payloads, including zero-length data, through unchanged', async function () {
      const harness = createHarness()
      const { transport, socket, response } = await harness.connect()
      const payloads = ['4hello', '', new ArrayBuffer(3), new ArrayBuffer(0)]

      for (const data of payloads) {
        expect(() => socket.onmessage({ data })).not.to.throw()
      }

      expect(response.status).to.equal(101)
      expect(transport.name).to.equal('websocket')
      expect(transport.upgradesTo).to.deep.equal([])
      expect(transport.writable).to.equal(true)
      expect(harness.decoded).to.have.length(payloads.length)
      payloads.forEach((data, index) => expect(harness.decoded[index]).to.equal(data))
      expect(transport.events.filter(({ event }) => event === 'packet')).to.have.length(payloads.length)
      expect(transport.events.filter(({ event }) => event === 'error')).to.have.length(0)
      expect(socket.closeCalls).to.equal(0)
    })

    it('Does not swallow unrelated packet-handler errors', async function () {
      const harness = createHarness()
      const { transport, socket } = await harness.connect()
      const failure = new Error('unrelated packet-handler failure')
      transport.listeners.packet = () => { throw failure }

      expect(() => socket.onmessage({ data: '4hello' })).to.throw(failure)
      expect(harness.decoded).to.deep.equal(['4hello'])
      expect(socket.closeCalls).to.equal(0)
    })

    for (const [label, accepted, oversized] of [
      ['text', '1234', '12345'],
      ['binary', new ArrayBuffer(4), new ArrayBuffer(5)]
    ]) {
      it(`Preserves the ${label} payload size limit`, async function () {
        const harness = createHarness()
        const { transport, socket } = await harness.connect({ maxHttpBufferSize: 4 })

        socket.onmessage({ data: accepted })
        socket.onmessage({ data: oversized })

        expect(harness.decoded).to.deep.equal([accepted])
        const failures = transport.events.filter(({ event }) => event === 'error')
        expect(failures).to.have.length(1)
        expect(failures[0].value.message).to.equal('payload too large')
        expect(socket.closeCalls).to.equal(1)
      })
    }
  })
}
