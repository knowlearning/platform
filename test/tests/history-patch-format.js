import { applyHistoryPatch, normalizeHistoryPatch } from '../../sites/admin/history-patch.js'

export default function historyPatchFormat() {
  describe('History patch format compatibility', function () {
    it('applies legacy JSON Pointer paths alongside current segment arrays', function () {
      const snapshot = applyHistoryPatch({}, [
        {
          op: 'add',
          path: ['modules'],
          value: {}
        },
        {
          op: 'add',
          path: '/modules/e105e620-8d47-11f0-b46f-a3159df8364a',
          value: { problems: [] }
        },
        {
          op: 'add',
          path: '/modules/e105e620-8d47-11f0-b46f-a3159df8364a/problems/0',
          value: { title: 'Legacy' }
        },
        {
          op: 'replace',
          path: ['modules', 'e105e620-8d47-11f0-b46f-a3159df8364a', 'problems', 0, 'title'],
          value: 'Current'
        }
      ])

      expect(snapshot).to.deep.equal({
        modules: {
          'e105e620-8d47-11f0-b46f-a3159df8364a': {
            problems: [{ title: 'Current' }]
          }
        }
      })
    })

    it('preserves legacy string paths and converts current array paths to JSON Pointer', function () {
      const normalized = normalizeHistoryPatch([
        {
          op: 'move',
          from: '/items/0',
          path: ['items', 1]
        }
      ])

      expect(normalized).to.deep.equal([
        {
          op: 'move',
          from: '/items/0',
          path: '/items/1'
        }
      ])
    })
  })
}
