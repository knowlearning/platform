import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { yaml } from '@codemirror/lang-yaml'
import YAML from 'yaml'
import cmYAMLPatchChanges from '../cm-yaml-patch-changes.js'

function applyPatches(yamlText, patch) {
  const state = EditorState.create({ doc: yamlText, extensions: [yaml()] })
  const tree = ensureSyntaxTree(state, yamlText.length)
  if (!tree) throw new Error('Failed to parse YAML syntax tree')
  const changes = cmYAMLPatchChanges(tree.topNode, yamlText, patch)

  let result = yamlText
  for (let i = changes.length - 1; i >= 0; i--) {
    const { from, to, insert } = changes[i]
    result = result.slice(0, from) + insert + result.slice(to)
  }
  return result
}

function parsed(yamlText, patch) {
  return YAML.parse(applyPatches(yamlText, patch))
}

// ---------------------------------------------------------------------------
// replace
// ---------------------------------------------------------------------------

describe('semantic round-trip: replace', () => {
  test('string → string', () => {
    const doc = 'name: alice\nage: 30\n'
    const out = parsed(doc, [{ op: 'replace', path: ['name'], value: 'bob' }])
    assert.equal(out.name, 'bob')
    assert.equal(out.age, 30)
  })

  test('number → number', () => {
    const doc = 'count: 5\n'
    const out = parsed(doc, [{ op: 'replace', path: ['count'], value: 42 }])
    assert.equal(out.count, 42)
  })

  test('boolean → boolean', () => {
    const doc = 'active: true\n'
    const out = parsed(doc, [{ op: 'replace', path: ['active'], value: false }])
    assert.equal(out.active, false)
  })

  test('value → null', () => {
    const doc = 'key: something\n'
    const out = parsed(doc, [{ op: 'replace', path: ['key'], value: null }])
    assert.equal(out.key, null)
  })

  test('string → number (type change)', () => {
    const doc = 'port: "8080"\n'
    const out = parsed(doc, [{ op: 'replace', path: ['port'], value: 9090 }])
    assert.equal(out.port, 9090)
  })

  test('nested key at depth 2', () => {
    const doc = 'server:\n  host: localhost\n  port: 3000\n'
    const out = parsed(doc, [{ op: 'replace', path: ['server', 'host'], value: '0.0.0.0' }])
    assert.equal(out.server.host, '0.0.0.0')
    assert.equal(out.server.port, 3000)
  })

  test('nested key at depth 3', () => {
    const doc = 'a:\n  b:\n    c: old\n    d: keep\n'
    const out = parsed(doc, [{ op: 'replace', path: ['a', 'b', 'c'], value: 'new' }])
    assert.equal(out.a.b.c, 'new')
    assert.equal(out.a.b.d, 'keep')
  })

  test('sequence item by index', () => {
    const doc = 'items:\n  - apple\n  - banana\n  - cherry\n'
    const out = parsed(doc, [{ op: 'replace', path: ['items', 1], value: 'mango' }])
    assert.deepEqual(out.items, ['apple', 'mango', 'cherry'])
  })

  test('scalar → array (type change to collection)', () => {
    const doc = 'tags: none\n'
    const out = parsed(doc, [{ op: 'replace', path: ['tags'], value: ['a', 'b', 'c'] }])
    assert.deepEqual(out.tags, ['a', 'b', 'c'])
  })

  test('scalar → object (type change to collection)', () => {
    const doc = 'config: simple\n'
    const out = parsed(doc, [{ op: 'replace', path: ['config'], value: { key: 'val', num: 1 } }])
    assert.deepEqual(out.config, { key: 'val', num: 1 })
  })

  test('block scalar: parsed value preserves multiline content', () => {
    const doc = 'title: hello\ndescription: short\n'
    const multiline = 'line one\nline two\nline three'
    const out = parsed(doc, [{ op: 'replace', path: ['description'], value: multiline }])
    assert.equal(out.title, 'hello')
    assert.ok(out.description.includes('line one'))
    assert.ok(out.description.includes('line two'))
    assert.ok(out.description.includes('line three'))
  })
})

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------

describe('semantic round-trip: add', () => {
  test('new key to flat map', () => {
    const doc = 'a: 1\nb: 2\n'
    const out = parsed(doc, [{ op: 'add', path: ['c'], value: 3 }])
    assert.equal(out.a, 1)
    assert.equal(out.b, 2)
    assert.equal(out.c, 3)
  })

  test('new key to nested map', () => {
    const doc = 'server:\n  host: localhost\n'
    const out = parsed(doc, [{ op: 'add', path: ['server', 'port'], value: 8080 }])
    assert.equal(out.server.host, 'localhost')
    assert.equal(out.server.port, 8080)
  })

  test('append to sequence', () => {
    const doc = 'items:\n  - x\n  - y\n'
    const out = parsed(doc, [{ op: 'add', path: ['items', 99], value: 'z' }])
    assert.deepEqual(out.items, ['x', 'y', 'z'])
  })

  test('prepend to sequence (index 0)', () => {
    const doc = 'items:\n  - b\n  - c\n'
    const out = parsed(doc, [{ op: 'add', path: ['items', 0], value: 'a' }])
    assert.equal(out.items[0], 'a')
    assert.equal(out.items.length, 3)
  })

  test('add array value', () => {
    const doc = 'name: test\n'
    const out = parsed(doc, [{ op: 'add', path: ['tags'], value: ['x', 'y'] }])
    assert.deepEqual(out.tags, ['x', 'y'])
  })

  test('add object value', () => {
    const doc = 'name: test\n'
    const out = parsed(doc, [{ op: 'add', path: ['meta'], value: { version: 1, stable: true } }])
    assert.deepEqual(out.meta, { version: 1, stable: true })
  })
})

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe('semantic round-trip: remove', () => {
  test('key from flat map — key absent, siblings preserved', () => {
    const doc = 'a: 1\nb: 2\nc: 3\n'
    const out = parsed(doc, [{ op: 'remove', path: ['b'] }])
    assert.equal(out.a, 1)
    assert.equal(out.b, undefined)
    assert.equal(out.c, 3)
  })

  test('key from nested map', () => {
    const doc = 'server:\n  host: localhost\n  port: 3000\n  debug: true\n'
    const out = parsed(doc, [{ op: 'remove', path: ['server', 'debug'] }])
    assert.equal(out.server.host, 'localhost')
    assert.equal(out.server.port, 3000)
    assert.equal(out.server.debug, undefined)
  })

  test('sequence item — array length decreases, others preserved', () => {
    const doc = 'items:\n  - a\n  - b\n  - c\n'
    const out = parsed(doc, [{ op: 'remove', path: ['items', 1] }])
    assert.equal(out.items.length, 2)
    assert.ok(out.items.includes('a'))
    assert.ok(out.items.includes('c'))
    assert.ok(!out.items.includes('b'))
  })

  test('first item in sequence', () => {
    const doc = 'items:\n  - first\n  - second\n  - third\n'
    const out = parsed(doc, [{ op: 'remove', path: ['items', 0] }])
    assert.equal(out.items[0], 'second')
    assert.equal(out.items.length, 2)
  })

  test('last item in sequence', () => {
    const doc = 'items:\n  - a\n  - b\n  - last\n'
    const out = parsed(doc, [{ op: 'remove', path: ['items', 2] }])
    assert.equal(out.items.length, 2)
    assert.ok(!out.items.includes('last'))
  })
})

// ---------------------------------------------------------------------------
// multi-op patches
// ---------------------------------------------------------------------------

describe('semantic round-trip: multi-op patches', () => {
  test('two replaces: both values updated, untouched keys unchanged', () => {
    const doc = 'a: 1\nb: 2\nc: 3\n'
    const out = parsed(doc, [
      { op: 'replace', path: ['a'], value: 10 },
      { op: 'replace', path: ['c'], value: 30 },
    ])
    assert.equal(out.a, 10)
    assert.equal(out.b, 2)
    assert.equal(out.c, 30)
  })

  test('add + replace on same map', () => {
    const doc = 'x: old\ny: keep\n'
    const out = parsed(doc, [
      { op: 'add', path: ['z'], value: 'added' },
      { op: 'replace', path: ['x'], value: 'new' },
    ])
    assert.equal(out.x, 'new')
    assert.equal(out.y, 'keep')
    assert.equal(out.z, 'added')
  })

  test('remove + replace: removed key absent, replaced key updated', () => {
    const doc = 'a: 1\nb: 2\nc: 3\n'
    const out = parsed(doc, [
      { op: 'remove', path: ['a'] },
      { op: 'replace', path: ['c'], value: 99 },
    ])
    assert.equal(out.a, undefined)
    assert.equal(out.b, 2)
    assert.equal(out.c, 99)
  })

  test('replace changes value length, subsequent replace still correct', () => {
    const doc = 'a: x\nb: y\nc: z\n'
    const out = parsed(doc, [
      { op: 'replace', path: ['a'], value: 'a-very-long-replacement-value' },
      { op: 'replace', path: ['b'], value: 'also-replaced' },
    ])
    assert.equal(out.a, 'a-very-long-replacement-value')
    assert.equal(out.b, 'also-replaced')
    assert.equal(out.c, 'z')
  })

  test('add + remove + replace combined', () => {
    const doc = 'keep: yes\nremove_me: old\nupdate_me: before\n'
    const out = parsed(doc, [
      { op: 'add', path: ['new_key'], value: 'added' },
      { op: 'remove', path: ['remove_me'] },
      { op: 'replace', path: ['update_me'], value: 'after' },
    ])
    assert.equal(out.new_key, 'added')
    assert.equal(out.remove_me, undefined)
    assert.equal(out.update_me, 'after')
    assert.equal(out.keep, 'yes')
  })

  test('many ops on large map: spot-check all categories', () => {
    const lines = []
    for (let i = 0; i < 50; i++) lines.push(`key${i}: value${i}`)
    const doc = lines.join('\n') + '\n'
    const out = parsed(doc, [
      { op: 'add', path: ['extra'], value: 'new' },
      { op: 'remove', path: ['key0'] },
      { op: 'remove', path: ['key1'] },
      { op: 'replace', path: ['key10'], value: 'replaced10' },
      { op: 'replace', path: ['key20'], value: 'replaced20' },
      { op: 'replace', path: ['key49'], value: 'replaced49' },
    ])
    assert.equal(out.extra, 'new')
    assert.equal(out.key0, undefined)
    assert.equal(out.key1, undefined)
    assert.equal(out.key10, 'replaced10')
    assert.equal(out.key20, 'replaced20')
    assert.equal(out.key49, 'replaced49')
    assert.equal(String(out.key5), 'value5')
    assert.equal(String(out.key30), 'value30')
  })
})

// ---------------------------------------------------------------------------
// complex structures
// ---------------------------------------------------------------------------

describe('semantic round-trip: complex structures', () => {
  test('deeply nested path (4 levels)', () => {
    const doc = 'a:\n  b:\n    c:\n      d: deep\n      e: keep\n'
    const out = parsed(doc, [{ op: 'replace', path: ['a', 'b', 'c', 'd'], value: 'updated' }])
    assert.equal(out.a.b.c.d, 'updated')
    assert.equal(out.a.b.c.e, 'keep')
  })

  test('map inside sequence: replace scalar in a sequence-item map', () => {
    const doc = 'users:\n  - name: alice\n    role: admin\n  - name: bob\n    role: user\n'
    const out = parsed(doc, [{ op: 'replace', path: ['users', 1, 'role'], value: 'moderator' }])
    assert.equal(out.users[0].name, 'alice')
    assert.equal(out.users[0].role, 'admin')
    assert.equal(out.users[1].name, 'bob')
    assert.equal(out.users[1].role, 'moderator')
  })

  test('sequence of maps: add key to one entry', () => {
    const doc = 'items:\n  - id: 1\n    val: a\n  - id: 2\n    val: b\n'
    const out = parsed(doc, [{ op: 'add', path: ['items', 0, 'extra'], value: 'added' }])
    assert.equal(out.items[0].extra, 'added')
    assert.equal(out.items[1].extra, undefined)
  })

  test('replace scattered keys in large map: all updated, rest unchanged', () => {
    const lines = []
    for (let i = 0; i < 50; i++) lines.push(`key${i}: original${i}`)
    const doc = lines.join('\n') + '\n'
    const targets = [0, 12, 25, 37, 49]
    const patch = targets.map(i => ({ op: 'replace', path: [`key${i}`], value: `patched${i}` }))
    const out = parsed(doc, patch)
    for (const i of targets) assert.equal(out[`key${i}`], `patched${i}`)
    for (let i = 0; i < 50; i++) {
      if (!targets.includes(i)) assert.equal(out[`key${i}`], `original${i}`)
    }
  })

  test('add to sequence, then replace sibling key', () => {
    const doc = 'tags:\n  - alpha\n  - beta\nstatus: pending\n'
    const out = parsed(doc, [
      { op: 'add', path: ['tags', 99], value: 'gamma' },
      { op: 'replace', path: ['status'], value: 'done' },
    ])
    assert.ok(out.tags.includes('alpha'))
    assert.ok(out.tags.includes('gamma'))
    assert.equal(out.status, 'done')
  })

  test('replace sequence item with object', () => {
    const doc = 'list:\n  - simple\n  - values\n'
    const out = parsed(doc, [{ op: 'replace', path: ['list', 0], value: { key: 'nested', num: 42 } }])
    assert.deepEqual(out.list[0], { key: 'nested', num: 42 })
    assert.equal(out.list[1], 'values')
  })
})
