// patch-yaml-ast.test.js
// Run with: node --test patch-yaml-ast.test.js

import test from 'node:test'
import assert from 'node:assert/strict'
import YAML from 'yaml'
import applyPatchToYamlAst from './patch-yaml-ast.js' // adjust if your file name differs

function docFrom(yaml) {
  return YAML.parseDocument(yaml)
}

function jsonOf(doc) {
  return doc.toJSON()
}

function strOf(doc) {
  return String(doc)
}

test('add: adds map key at root', () => {
  const doc = docFrom(`a: 1\n`)
  applyPatchToYamlAst(doc, [{ op: 'add', path: ['b'], value: 2 }])
  assert.deepEqual(jsonOf(doc), { a: 1, b: 2 })
})

test('replace: replaces root when path is []', () => {
  const doc = docFrom(`a: 1\n`)
  applyPatchToYamlAst(doc, [{ op: 'replace', path: [], value: { z: 9 } }])
  assert.deepEqual(jsonOf(doc), { z: 9 })
})

test('add: creates missing parents (map->map)', () => {
  const doc = docFrom(`a: 1\n`)
  applyPatchToYamlAst(doc, [{ op: 'add', path: ['x', 'y', 'z'], value: 10 }])
  assert.deepEqual(jsonOf(doc), { a: 1, x: { y: { z: 10 } } })
})

test('add: creates missing parents (map->seq->map)', () => {
  const doc = docFrom(`root: {}\n`)
  applyPatchToYamlAst(doc, [{ op: 'add', path: ['root', 'items', '0', 'name'], value: 'n1' }])
  assert.deepEqual(jsonOf(doc), { root: { items: [{ name: 'n1' }] } })
})

test('add: inserts into array at index', () => {
  const doc = docFrom(`arr: [a, c]\n`)
  applyPatchToYamlAst(doc, [{ op: 'add', path: ['arr', '1'], value: 'b' }])
  assert.deepEqual(jsonOf(doc), { arr: ['a', 'b', 'c'] })
})

test('replace: overwrites array element at index', () => {
  const doc = docFrom(`arr: [a, b, c]\n`)
  applyPatchToYamlAst(doc, [{ op: 'replace', path: ['arr', '1'], value: 'B' }])
  assert.deepEqual(jsonOf(doc), { arr: ['a', 'B', 'c'] })
})

test('remove: removes map key', () => {
  const doc = docFrom(`a: 1\nb: 2\n`)
  applyPatchToYamlAst(doc, [{ op: 'remove', path: ['a'] }])
  assert.deepEqual(jsonOf(doc), { b: 2 })
})

test('remove: removes array element', () => {
  const doc = docFrom(`arr: [a, b, c]\n`)
  applyPatchToYamlAst(doc, [{ op: 'remove', path: ['arr', '1'] }])
  assert.deepEqual(jsonOf(doc), { arr: ['a', 'c'] })
})

test('replace: errors if parent path does not exist', () => {
  const doc = docFrom(`a: 1\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'replace', path: ['x', 'y'], value: 1 }]),
    /Path does not exist|missing key/i
  )
})

test('remove: errors if key missing', () => {
  const doc = docFrom(`a: 1\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'remove', path: ['b'] }]),
    /missing key/i
  )
})

test('add: errors on array index out of bounds (> len)', () => {
  const doc = docFrom(`arr: [a]\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'add', path: ['arr', '2'], value: 'x' }]),
    /out of bounds/i
  )
})

test('test: passes when equal', () => {
  const doc = docFrom(`a: { b: 2 }\n`)
  applyPatchToYamlAst(doc, [{ op: 'test', path: ['a', 'b'], value: 2 }])
  assert.deepEqual(jsonOf(doc), { a: { b: 2 } })
})

test('test: fails when not equal', () => {
  const doc = docFrom(`a: { b: 2 }\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'test', path: ['a', 'b'], value: 3 }]),
    /test failed/i
  )
})

test('copy: copies value from one path to another (map->map)', () => {
  const doc = docFrom(`a: { b: 2 }\n`)
  applyPatchToYamlAst(doc, [{ op: 'copy', from: ['a', 'b'], path: ['a', 'c'] }])
  assert.deepEqual(jsonOf(doc), { a: { b: 2, c: 2 } })
})

test('move: moves value from one path to another (map->map)', () => {
  const doc = docFrom(`a: { b: 2 }\n`)
  applyPatchToYamlAst(doc, [{ op: 'move', from: ['a', 'b'], path: ['a', 'c'] }])
  assert.deepEqual(jsonOf(doc), { a: { c: 2 } })
})

test('copy: copies array element', () => {
  const doc = docFrom(`arr: [a, b, c]\n`)
  applyPatchToYamlAst(doc, [{ op: 'copy', from: ['arr', '0'], path: ['arr', '2'] }])
  // copy inserts at index 2
  assert.deepEqual(jsonOf(doc), { arr: ['a', 'b', 'a', 'c'] })
})

test('move: moves array element (remove then add semantics)', () => {
  const doc = docFrom(`arr: [a, b, c]\n`)
  applyPatchToYamlAst(doc, [{ op: 'move', from: ['arr', '0'], path: ['arr', '2'] }])
  // remove index 0 => [b,c], then insert at index 2 => [b,c,a]
  assert.deepEqual(jsonOf(doc), { arr: ['b', 'c', 'a'] })
})

test('add: errors when traversing into a scalar (no implicit scalar->container coercion)', () => {
  const doc = docFrom(`a: 1\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'add', path: ['a', 'b'], value: 2 }]),
    /Cannot traverse|not a map or seq|non-collection|Target parent/i
  )
})

test('path segments: numeric-like keys in maps still treated as keys when parent is a map', () => {
  const doc = docFrom(`root:\n  "0": zero\n`)
  applyPatchToYamlAst(doc, [{ op: 'replace', path: ['root', '0'], value: 'ZERO' }])
  assert.deepEqual(jsonOf(doc), { root: { '0': 'ZERO' } })
})

test('validate option: rejects invalid JSON Patch op shapes', () => {
  const doc = docFrom(`a: 1\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'add', path: ['b'] }], { validate: true }),
    /Invalid JSON Patch/i
  )
})

test('multiple ops: behaves like sequential patch application', () => {
  const doc = docFrom(`a: 1\narr: [x]\n`)
  applyPatchToYamlAst(doc, [
    { op: 'add', path: ['b'], value: 2 },
    { op: 'add', path: ['arr', '1'], value: 'y' },
    { op: 'replace', path: ['a'], value: 10 },
    { op: 'remove', path: ['b'] }
  ])
  assert.deepEqual(jsonOf(doc), { a: 10, arr: ['x', 'y'] })
})

test('yaml roundtrip sanity: patch results serialize as expected', () => {
  const doc = docFrom(`a: 1\n`)
  applyPatchToYamlAst(doc, [{ op: 'add', path: ['x', 'y'], value: [1, 2] }])
  const out = strOf(doc)
  assert.match(out, /x:\n(\s+)y:/)
})

/* ---------------- additional coverage ---------------- */

test('empty document: add at root initializes doc.contents', () => {
  const doc = docFrom(``)
  // YAML.parseDocument('') yields an empty doc where contents is typically null
  applyPatchToYamlAst(doc, [{ op: 'add', path: ['a'], value: 1 }])
  assert.deepEqual(jsonOf(doc), { a: 1 })
})

test('add: path [] replaces root (same as replace for root)', () => {
  const doc = docFrom(`a: 1\n`)
  applyPatchToYamlAst(doc, [{ op: 'add', path: [], value: [1, 2] }])
  assert.deepEqual(jsonOf(doc), [1, 2])
})

test('remove: path [] is rejected explicitly', () => {
  const doc = docFrom(`a: 1\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'remove', path: [] }]),
    /Cannot remove the root node/i
  )
})

test('node input: can patch doc.contents directly (non-Document)', () => {
  const doc = docFrom(`a: 1\n`)
  const rootNode = doc.contents
  applyPatchToYamlAst(rootNode, [{ op: 'add', path: ['b'], value: 2 }])
  assert.deepEqual(jsonOf(doc), { a: 1, b: 2 })
})

test('add: adding an existing map key overwrites its value (object add semantics)', () => {
  const doc = docFrom(`a: 1\n`)
  applyPatchToYamlAst(doc, [{ op: 'add', path: ['a'], value: 2 }])
  assert.deepEqual(jsonOf(doc), { a: 2 })
})

test('add: array insert at index == len appends', () => {
  const doc = docFrom(`arr: [a, b]\n`)
  applyPatchToYamlAst(doc, [{ op: 'add', path: ['arr', '2'], value: 'c' }])
  assert.deepEqual(jsonOf(doc), { arr: ['a', 'b', 'c'] })
})

test('replace: array replace at index == len currently appends (documents current behavior)', () => {
  const doc = docFrom(`arr: [a, b]\n`)
  applyPatchToYamlAst(doc, [{ op: 'replace', path: ['arr', '2'], value: 'c' }])
  assert.deepEqual(jsonOf(doc), { arr: ['a', 'b', 'c'] })
})

test('remove: errors on missing array index', () => {
  const doc = docFrom(`arr: [a]\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'remove', path: ['arr', '1'] }]),
    /missing index|Cannot remove missing index/i
  )
})

test('copy: can copy root to become the new root', () => {
  const doc = docFrom(`a: 1\nb: 2\n`)
  applyPatchToYamlAst(doc, [{ op: 'copy', from: ['a'], path: [] }])
  assert.deepEqual(jsonOf(doc), 1)
})

test('move: can move root to become the new root (from [] to [])', () => {
  const doc = docFrom(`a: 1\n`)
  applyPatchToYamlAst(doc, [{ op: 'move', from: [], path: [] }])
  // move root-to-root is effectively a no-op for value; implementation recreates nodes but value should match
  assert.deepEqual(jsonOf(doc), { a: 1 })
})

test('move: within same array where destination is after source uses remove-then-insert semantics', () => {
  const doc = docFrom(`arr: [a, b, c, d]\n`)
  applyPatchToYamlAst(doc, [{ op: 'move', from: ['arr', '1'], path: ['arr', '3'] }])
  // remove b => [a,c,d], then insert b at index 3 => [a,c,d,b]
  assert.deepEqual(jsonOf(doc), { arr: ['a', 'c', 'd', 'b'] })
})

test('move: within same array where destination is before source', () => {
  const doc = docFrom(`arr: [a, b, c, d]\n`)
  applyPatchToYamlAst(doc, [{ op: 'move', from: ['arr', '3'], path: ['arr', '1'] }])
  // remove d => [a,b,c], then insert at 1 => [a,d,b,c]
  assert.deepEqual(jsonOf(doc), { arr: ['a', 'd', 'b', 'c'] })
})

test('validate option: supports from/path conversion and pointer escaping (~ and /)', () => {
  const doc = docFrom(`"a/b":\n  "~x": 1\n`)
  applyPatchToYamlAst(
    doc,
    [
      { op: 'copy', from: ['a/b', '~x'], path: ['dst~key/part'] },
      { op: 'test', path: ['dst~key/part'], value: 1 }
    ],
    { validate: true }
  )
  assert.deepEqual(jsonOf(doc), { 'a/b': { '~x': 1 }, 'dst~key/part': 1 })
})

test('copy: errors when from path does not exist', () => {
  const doc = docFrom(`a: 1\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'copy', from: ['nope'], path: ['x'] }]),
    /Path does not exist/i
  )
})

test('move: errors when from path does not exist', () => {
  const doc = docFrom(`a: 1\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'move', from: ['nope'], path: ['x'] }]),
    /Path does not exist/i
  )
})

test('normalizeOp: rejects non-array path', () => {
  const doc = docFrom(`a: 1\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'add', path: '/a', value: 1 }]),
    /path must be an array/i
  )
})

test('normalizeOp: move/copy rejects missing from array', () => {
  const doc = docFrom(`a: 1\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'move', from: '/a', path: ['b'] }]),
    /requires "from" as an array path/i
  )
})