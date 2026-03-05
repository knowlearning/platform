import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { yaml } from '@codemirror/lang-yaml'
import cmYAMLPatchChanges from '../cm-yaml-patch-changes.js'

function applyPatches(yamlText, patch) {
  const state = EditorState.create({ doc: yamlText, extensions: [yaml()] })
  const tree = ensureSyntaxTree(state, yamlText.length)
  if (!tree) throw new Error('Failed to parse YAML syntax tree')
  const changes = cmYAMLPatchChanges(tree.topNode, yamlText, patch)

  // Apply in reverse so later positions don't shift earlier ones
  let result = yamlText
  for (let i = changes.length - 1; i >= 0; i--) {
    const { from, to, insert } = changes[i]
    result = result.slice(0, from) + insert + result.slice(to)
  }
  return result
}

describe('replace operations', () => {
  test('replace string value', () => {
    assert.equal(
      applyPatches(`\
name: alice
`, [{ op: 'replace', path: ['name'], value: 'bob' }]),
      `\
name: bob
`
    )
  })

  test('replace number value', () => {
    assert.equal(
      applyPatches(`\
count: 5
`, [{ op: 'replace', path: ['count'], value: 10 }]),
      `\
count: 10
`
    )
  })

  test('replace boolean value', () => {
    assert.equal(
      applyPatches(`\
active: true
`, [{ op: 'replace', path: ['active'], value: false }]),
      `\
active: false
`
    )
  })

  test('replace value with null', () => {
    assert.equal(
      applyPatches(`\
x: 42
`, [{ op: 'replace', path: ['x'], value: null }]),
      `\
x: null
`
    )
  })

  test('replace null with number', () => {
    assert.equal(
      applyPatches(`\
x: null
`, [{ op: 'replace', path: ['x'], value: 42 }]),
      `\
x: 42
`
    )
  })

  test('replace value with empty string', () => {
    assert.equal(
      applyPatches(`\
x: hello
`, [{ op: 'replace', path: ['x'], value: '' }]),
      `\
x: ""
`
    )
  })

  test('replace empty string with non-empty string', () => {
    assert.equal(
      applyPatches(`\
x: ""
`, [{ op: 'replace', path: ['x'], value: 'world' }]),
      `\
x: world
`
    )
  })

  test('replace nested map value', () => {
    assert.equal(
      applyPatches(`\
a:
  b: 1
`, [{ op: 'replace', path: ['a', 'b'], value: 2 }]),
      `\
a:
  b: 2
`
    )
  })

  test('replace deeply nested value', () => {
    assert.equal(
      applyPatches(`\
a:
  b:
    c: deep
`, [{ op: 'replace', path: ['a', 'b', 'c'], value: 'changed' }]),
      `\
a:
  b:
    c: changed
`
    )
  })

  test('replace first sequence item', () => {
    assert.equal(
      applyPatches(`\
items:
  - a
  - b
  - c
`, [{ op: 'replace', path: ['items', 0], value: 'x' }]),
      `\
items:
  - x
  - b
  - c
`
    )
  })

  test('replace middle sequence item', () => {
    assert.equal(
      applyPatches(`\
items:
  - a
  - b
  - c
`, [{ op: 'replace', path: ['items', 1], value: 'x' }]),
      `\
items:
  - a
  - x
  - c
`
    )
  })

  test('replace last sequence item', () => {
    assert.equal(
      applyPatches(`\
items:
  - a
  - b
  - c
`, [{ op: 'replace', path: ['items', 2], value: 'x' }]),
      `\
items:
  - a
  - b
  - x
`
    )
  })

  test('replace non-existent path is a no-op', () => {
    const doc = `\
x: 5
`
    assert.equal(
      applyPatches(doc, [{ op: 'replace', path: ['nonexistent'], value: 99 }]),
      doc
    )
  })

  test('replace out-of-bounds array index is a no-op', () => {
    const doc = `\
items:
  - a
  - b
`
    assert.equal(
      applyPatches(doc, [{ op: 'replace', path: ['items', 99], value: 'x' }]),
      doc
    )
  })
})

describe('remove operations', () => {
  test('remove middle key', () => {
    assert.equal(
      applyPatches(`\
a: 1
b: 2
c: 3
`, [{ op: 'remove', path: ['b'] }]),
      `\
a: 1
c: 3
`
    )
  })

  test('remove first key', () => {
    assert.equal(
      applyPatches(`\
a: 1
b: 2
`, [{ op: 'remove', path: ['a'] }]),
      `\
b: 2
`
    )
  })

  test('remove last key', () => {
    assert.equal(
      applyPatches(`\
a: 1
b: 2
`, [{ op: 'remove', path: ['b'] }]),
      `\
a: 1
`
    )
  })

  test('remove nested key', () => {
    assert.equal(
      applyPatches(`\
a:
  b: 1
  c: 2
`, [{ op: 'remove', path: ['a', 'b'] }]),
      `\
a:
  c: 2
`
    )
  })

  test('remove first sequence item', () => {
    assert.equal(
      applyPatches(`\
items:
  - a
  - b
  - c
`, [{ op: 'remove', path: ['items', 0] }]),
      `\
items:
  - b
  - c
`
    )
  })

  test('remove middle sequence item', () => {
    assert.equal(
      applyPatches(`\
items:
  - a
  - b
  - c
`, [{ op: 'remove', path: ['items', 1] }]),
      `\
items:
  - a
  - c
`
    )
  })

  test('remove last sequence item', () => {
    assert.equal(
      applyPatches(`\
items:
  - a
  - b
  - c
`, [{ op: 'remove', path: ['items', 2] }]),
      `\
items:
  - a
  - b
`
    )
  })

  test('remove sole sequence item', () => {
    assert.equal(
      applyPatches(`\
items:
  - only
`, [{ op: 'remove', path: ['items', 0] }]),
      `\
items:
`
    )
  })

  test('remove non-existent key is a no-op', () => {
    const doc = `\
a: 1
b: 2
`
    assert.equal(
      applyPatches(doc, [{ op: 'remove', path: ['nonexistent'] }]),
      doc
    )
  })

  test('remove out-of-bounds array index is a no-op', () => {
    const doc = `\
items:
  - a
  - b
`
    assert.equal(
      applyPatches(doc, [{ op: 'remove', path: ['items', 99] }]),
      doc
    )
  })
})

describe('add operations', () => {
  test('add string key to map', () => {
    assert.equal(
      applyPatches(`\
a: 1
`, [{ op: 'add', path: ['b'], value: 'hello' }]),
      `\
a: 1
b: hello
`
    )
  })

  test('add numeric value to map', () => {
    assert.equal(
      applyPatches(`\
a: 1
`, [{ op: 'add', path: ['b'], value: 42 }]),
      `\
a: 1
b: 42
`
    )
  })

  test('add boolean value to map', () => {
    assert.equal(
      applyPatches(`\
a: 1
`, [{ op: 'add', path: ['b'], value: true }]),
      `\
a: 1
b: true
`
    )
  })

  test('add null value to map', () => {
    assert.equal(
      applyPatches(`\
a: 1
`, [{ op: 'add', path: ['b'], value: null }]),
      `\
a: 1
b: null
`
    )
  })

  test('add nested key', () => {
    assert.equal(
      applyPatches(`\
a:
  b: 1
`, [{ op: 'add', path: ['a', 'c'], value: 'new' }]),
      `\
a:
  b: 1
  c: new
`
    )
  })

  test('add sequence item at start', () => {
    assert.equal(
      applyPatches(`\
items:
  - a
  - b
`, [{ op: 'add', path: ['items', 0], value: 'x' }]),
      `\
items:
  - x
  - a
  - b
`
    )
  })

  test('add sequence item in middle', () => {
    assert.equal(
      applyPatches(`\
items:
  - a
  - b
`, [{ op: 'add', path: ['items', 1], value: 'x' }]),
      `\
items:
  - a
  - x
  - b
`
    )
  })

  test('add sequence item at end by exact index', () => {
    assert.equal(
      applyPatches(`\
items:
  - a
  - b
`, [{ op: 'add', path: ['items', 2], value: 'x' }]),
      `\
items:
  - a
  - b
  - x
`
    )
  })

  test('add sequence item past end appends', () => {
    assert.equal(
      applyPatches(`\
items:
  - a
  - b
`, [{ op: 'add', path: ['items', 99], value: 'x' }]),
      `\
items:
  - a
  - b
  - x
`
    )
  })

  test('add to non-existent parent is a no-op', () => {
    const doc = `\
a: 1
`
    assert.equal(
      applyPatches(doc, [{ op: 'add', path: ['nonexistent', 'c'], value: 'x' }]),
      doc
    )
  })
})

describe('edge and degenerate cases', () => {
  test('empty patch returns unchanged text', () => {
    const doc = `\
a: 1
b: 2
`
    assert.equal(applyPatches(doc, []), doc)
  })

  test('key with hyphens', () => {
    assert.equal(
      applyPatches(`\
my-key: val
`, [{ op: 'replace', path: ['my-key'], value: 'new' }]),
      `\
my-key: new
`
    )
  })

  test('key with underscores', () => {
    assert.equal(
      applyPatches(`\
my_key: val
`, [{ op: 'replace', path: ['my_key'], value: 'new' }]),
      `\
my_key: new
`
    )
  })

  test('key with numbers', () => {
    assert.equal(
      applyPatches(`\
key123: val
`, [{ op: 'replace', path: ['key123'], value: 'new' }]),
      `\
key123: new
`
    )
  })

  test('4-level deep nesting', () => {
    assert.equal(
      applyPatches(`\
a:
  b:
    c:
      d: 1
`, [{ op: 'replace', path: ['a', 'b', 'c', 'd'], value: 2 }]),
      `\
a:
  b:
    c:
      d: 2
`
    )
  })

  test('multi-op patch applied atomically from original tree', () => {
    assert.equal(
      applyPatches(`\
a: 1
b: 2
`, [
        { op: 'add', path: ['c'], value: 'new' },
        { op: 'replace', path: ['a'], value: 99 },
        { op: 'remove', path: ['b'] }
      ]),
      `\
a: 99
c: new
`
    )
  })

  test('remove sole key from document', () => {
    assert.equal(
      applyPatches(`\
a: 1
`, [{ op: 'remove', path: ['a'] }]),
      ``
    )
  })

  test('numeric string map key (string path segment, not array index)', () => {
    assert.equal(
      applyPatches(`\
0: val
`, [{ op: 'replace', path: ['0'], value: 'new' }]),
      `\
0: new
`
    )
  })

  test('string value with YAML special chars gets auto-quoted', () => {
    assert.equal(
      applyPatches(`\
x: plain
`, [{ op: 'replace', path: ['x'], value: 'has: colon' }]),
      `\
x: "has: colon"
`
    )
  })
})
