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
      applyPatches('name: alice\n', [{ op: 'replace', path: ['name'], value: 'bob' }]),
      'name: bob\n'
    )
  })

  test('replace number value', () => {
    assert.equal(
      applyPatches('count: 5\n', [{ op: 'replace', path: ['count'], value: 10 }]),
      'count: 10\n'
    )
  })

  test('replace boolean value', () => {
    assert.equal(
      applyPatches('active: true\n', [{ op: 'replace', path: ['active'], value: false }]),
      'active: false\n'
    )
  })

  test('replace value with null', () => {
    assert.equal(
      applyPatches('x: 42\n', [{ op: 'replace', path: ['x'], value: null }]),
      'x: null\n'
    )
  })

  test('replace null with number', () => {
    assert.equal(
      applyPatches('x: null\n', [{ op: 'replace', path: ['x'], value: 42 }]),
      'x: 42\n'
    )
  })

  test('replace value with empty string', () => {
    // YAML.stringify("") produces `""\n` — double-quoted empty string
    assert.equal(
      applyPatches('x: hello\n', [{ op: 'replace', path: ['x'], value: '' }]),
      'x: ""\n'
    )
  })

  test('replace empty string with non-empty string', () => {
    assert.equal(
      applyPatches('x: ""\n', [{ op: 'replace', path: ['x'], value: 'world' }]),
      'x: world\n'
    )
  })

  test('replace nested map value', () => {
    assert.equal(
      applyPatches('a:\n  b: 1\n', [{ op: 'replace', path: ['a', 'b'], value: 2 }]),
      'a:\n  b: 2\n'
    )
  })

  test('replace deeply nested value', () => {
    assert.equal(
      applyPatches('a:\n  b:\n    c: deep\n', [{ op: 'replace', path: ['a', 'b', 'c'], value: 'changed' }]),
      'a:\n  b:\n    c: changed\n'
    )
  })

  test('replace first sequence item', () => {
    assert.equal(
      applyPatches('items:\n  - a\n  - b\n  - c\n', [{ op: 'replace', path: ['items', 0], value: 'x' }]),
      'items:\n  - x\n  - b\n  - c\n'
    )
  })

  test('replace middle sequence item', () => {
    assert.equal(
      applyPatches('items:\n  - a\n  - b\n  - c\n', [{ op: 'replace', path: ['items', 1], value: 'x' }]),
      'items:\n  - a\n  - x\n  - c\n'
    )
  })

  test('replace last sequence item', () => {
    assert.equal(
      applyPatches('items:\n  - a\n  - b\n  - c\n', [{ op: 'replace', path: ['items', 2], value: 'x' }]),
      'items:\n  - a\n  - b\n  - x\n'
    )
  })

  test('replace non-existent path is a no-op', () => {
    const doc = 'x: 5\n'
    assert.equal(
      applyPatches(doc, [{ op: 'replace', path: ['nonexistent'], value: 99 }]),
      doc
    )
  })

  test('replace out-of-bounds array index is a no-op', () => {
    const doc = 'items:\n  - a\n  - b\n'
    assert.equal(
      applyPatches(doc, [{ op: 'replace', path: ['items', 99], value: 'x' }]),
      doc
    )
  })
})

describe('remove operations', () => {
  test('remove middle key', () => {
    assert.equal(
      applyPatches('a: 1\nb: 2\nc: 3\n', [{ op: 'remove', path: ['b'] }]),
      'a: 1\nc: 3\n'
    )
  })

  test('remove first key', () => {
    assert.equal(
      applyPatches('a: 1\nb: 2\n', [{ op: 'remove', path: ['a'] }]),
      'b: 2\n'
    )
  })

  test('remove last key', () => {
    assert.equal(
      applyPatches('a: 1\nb: 2\n', [{ op: 'remove', path: ['b'] }]),
      'a: 1\n'
    )
  })

  test('remove nested key', () => {
    assert.equal(
      applyPatches('a:\n  b: 1\n  c: 2\n', [{ op: 'remove', path: ['a', 'b'] }]),
      'a:\n  c: 2\n'
    )
  })

  test('remove first sequence item', () => {
    assert.equal(
      applyPatches('items:\n  - a\n  - b\n  - c\n', [{ op: 'remove', path: ['items', 0] }]),
      'items:\n  - b\n  - c\n'
    )
  })

  test('remove middle sequence item', () => {
    assert.equal(
      applyPatches('items:\n  - a\n  - b\n  - c\n', [{ op: 'remove', path: ['items', 1] }]),
      'items:\n  - a\n  - c\n'
    )
  })

  test('remove last sequence item', () => {
    assert.equal(
      applyPatches('items:\n  - a\n  - b\n  - c\n', [{ op: 'remove', path: ['items', 2] }]),
      'items:\n  - a\n  - b\n'
    )
  })

  test('remove sole sequence item', () => {
    assert.equal(
      applyPatches('items:\n  - only\n', [{ op: 'remove', path: ['items', 0] }]),
      'items:\n'
    )
  })

  test('remove non-existent key is a no-op', () => {
    const doc = 'a: 1\nb: 2\n'
    assert.equal(
      applyPatches(doc, [{ op: 'remove', path: ['nonexistent'] }]),
      doc
    )
  })

  test('remove out-of-bounds array index is a no-op', () => {
    const doc = 'items:\n  - a\n  - b\n'
    assert.equal(
      applyPatches(doc, [{ op: 'remove', path: ['items', 99] }]),
      doc
    )
  })
})

describe('add operations', () => {
  test('add string key to map', () => {
    assert.equal(
      applyPatches('a: 1\n', [{ op: 'add', path: ['b'], value: 'hello' }]),
      'a: 1\nb: hello\n'
    )
  })

  test('add numeric value to map', () => {
    assert.equal(
      applyPatches('a: 1\n', [{ op: 'add', path: ['b'], value: 42 }]),
      'a: 1\nb: 42\n'
    )
  })

  test('add boolean value to map', () => {
    assert.equal(
      applyPatches('a: 1\n', [{ op: 'add', path: ['b'], value: true }]),
      'a: 1\nb: true\n'
    )
  })

  test('add null value to map', () => {
    assert.equal(
      applyPatches('a: 1\n', [{ op: 'add', path: ['b'], value: null }]),
      'a: 1\nb: null\n'
    )
  })

  test('add nested key', () => {
    assert.equal(
      applyPatches('a:\n  b: 1\n', [{ op: 'add', path: ['a', 'c'], value: 'new' }]),
      'a:\n  b: 1\n  c: new\n'
    )
  })

  test('add sequence item at start', () => {
    assert.equal(
      applyPatches('items:\n  - a\n  - b\n', [{ op: 'add', path: ['items', 0], value: 'x' }]),
      'items:\n  - x\n  - a\n  - b\n'
    )
  })

  test('add sequence item in middle', () => {
    assert.equal(
      applyPatches('items:\n  - a\n  - b\n', [{ op: 'add', path: ['items', 1], value: 'x' }]),
      'items:\n  - a\n  - x\n  - b\n'
    )
  })

  test('add sequence item at end by exact index', () => {
    assert.equal(
      applyPatches('items:\n  - a\n  - b\n', [{ op: 'add', path: ['items', 2], value: 'x' }]),
      'items:\n  - a\n  - b\n  - x\n'
    )
  })

  test('add sequence item past end appends', () => {
    assert.equal(
      applyPatches('items:\n  - a\n  - b\n', [{ op: 'add', path: ['items', 99], value: 'x' }]),
      'items:\n  - a\n  - b\n  - x\n'
    )
  })

  test('add to non-existent parent is a no-op', () => {
    const doc = 'a: 1\n'
    assert.equal(
      applyPatches(doc, [{ op: 'add', path: ['nonexistent', 'c'], value: 'x' }]),
      doc
    )
  })
})

describe('edge and degenerate cases', () => {
  test('empty patch returns unchanged text', () => {
    const doc = 'a: 1\nb: 2\n'
    assert.equal(applyPatches(doc, []), doc)
  })

  test('key with hyphens', () => {
    assert.equal(
      applyPatches('my-key: val\n', [{ op: 'replace', path: ['my-key'], value: 'new' }]),
      'my-key: new\n'
    )
  })

  test('key with underscores', () => {
    assert.equal(
      applyPatches('my_key: val\n', [{ op: 'replace', path: ['my_key'], value: 'new' }]),
      'my_key: new\n'
    )
  })

  test('key with numbers', () => {
    assert.equal(
      applyPatches('key123: val\n', [{ op: 'replace', path: ['key123'], value: 'new' }]),
      'key123: new\n'
    )
  })

  test('4-level deep nesting', () => {
    assert.equal(
      applyPatches('a:\n  b:\n    c:\n      d: 1\n', [{ op: 'replace', path: ['a', 'b', 'c', 'd'], value: 2 }]),
      'a:\n  b:\n    c:\n      d: 2\n'
    )
  })

  test('multi-op patch applied atomically from original tree', () => {
    // add /c, replace /a, remove /b — all resolved against original doc positions
    assert.equal(
      applyPatches('a: 1\nb: 2\n', [
        { op: 'add', path: ['c'], value: 'new' },
        { op: 'replace', path: ['a'], value: 99 },
        { op: 'remove', path: ['b'] }
      ]),
      'a: 99\nc: new\n'
    )
  })

  test('remove sole key from document', () => {
    assert.equal(
      applyPatches('a: 1\n', [{ op: 'remove', path: ['a'] }]),
      ''
    )
  })

  test('numeric string map key (string path segment, not array index)', () => {
    // path segment '0' as a string → looks up map key "0", not a sequence item
    assert.equal(
      applyPatches('0: val\n', [{ op: 'replace', path: ['0'], value: 'new' }]),
      '0: new\n'
    )
  })

  test('string value with YAML special chars gets auto-quoted', () => {
    // YAML.stringify handles quoting: "has: colon" must be quoted in YAML
    assert.equal(
      applyPatches('x: plain\n', [{ op: 'replace', path: ['x'], value: 'has: colon' }]),
      'x: "has: colon"\n'
    )
  })
})
