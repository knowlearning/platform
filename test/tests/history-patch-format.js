import {
  applyHistoryPatch,
  inspectHistoryPatchApplication,
  normalizeHistoryPatch,
  orderHistoryPatch
} from '../../sites/admin/history-patch.js'

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

    it('can replay a failing patch batch after reordering operations', function () {
      const moduleId = 'e105e620-8d47-11f0-b46f-a3159df8364a'
      const problems = Array.from({ length: 26 }, (_, index) => `problem-${index}`)
      const patch = [
        {
          op: 'remove',
          path: ['modules', moduleId, 'problems', 25]
        },
        {
          op: 'replace',
          path: ['modules', moduleId, 'problems', 25],
          value: null
        },
        {
          op: 'replace',
          path: ['modules', moduleId, 'problems'],
          value: problems.slice(0, 25)
        }
      ]
      const snapshot = {
        modules: {
          [moduleId]: {
            problems
          }
        }
      }

      const failed = inspectHistoryPatchApplication(snapshot, patch)
      expect(failed.ok).to.equal(false)
      expect(failed.error.failedPosition).to.equal(1)
      expect(failed.error.failedOriginalIndex).to.equal(1)
      expect(failed.error.failedOperation).to.deep.equal(patch[1])

      const reordered = inspectHistoryPatchApplication(snapshot, patch, [1, 0, 2])
      expect(reordered.ok).to.equal(true)
      expect(orderHistoryPatch(patch, [1, 0, 2])[0]).to.deep.equal(patch[1])
      expect(reordered.snapshot.modules[moduleId].problems).to.deep.equal(problems.slice(0, 25))

      expect(applyHistoryPatch(snapshot, patch, [1, 0, 2])).to.deep.equal(reordered.snapshot)
    })
  })
}
