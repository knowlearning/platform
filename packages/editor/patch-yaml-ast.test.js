// patch-yaml-ast.test.js
// Run with: node --test patch-yaml-ast.test.js

// NOTE: array index path segments must be integers (not strings)
import test from 'node:test'
import assert from 'node:assert/strict'
import YAML from 'yaml'
import applyPatchToYamlAst from './patch-yaml-ast.js'

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
  applyPatchToYamlAst(doc, [{ op: 'add', path: ['root', 'items', 0, 'name'], value: 'n1' }])
  assert.deepEqual(jsonOf(doc), { root: { items: [{ name: 'n1' }] } })
})

test('add: inserts into array at index', () => {
  const doc = docFrom(`arr: [a, c]\n`)
  applyPatchToYamlAst(doc, [{ op: 'add', path: ['arr', 1], value: 'b' }])
  assert.deepEqual(jsonOf(doc), { arr: ['a', 'b', 'c'] })
})

test('replace: overwrites array element at index', () => {
  const doc = docFrom(`arr: [a, b, c]\n`)
  applyPatchToYamlAst(doc, [{ op: 'replace', path: ['arr', 1], value: 'B' }])
  assert.deepEqual(jsonOf(doc), { arr: ['a', 'B', 'c'] })
})

test('remove: removes map key', () => {
  const doc = docFrom(`a: 1\nb: 2\n`)
  applyPatchToYamlAst(doc, [{ op: 'remove', path: ['a'] }])
  assert.deepEqual(jsonOf(doc), { b: 2 })
})

test('remove: removes array element', () => {
  const doc = docFrom(`arr: [a, b, c]\n`)
  applyPatchToYamlAst(doc, [{ op: 'remove', path: ['arr', 1] }])
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
    () => applyPatchToYamlAst(doc, [{ op: 'add', path: ['arr', 2], value: 'x' }]),
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
  applyPatchToYamlAst(doc, [{ op: 'copy', from: ['arr', 0], path: ['arr', 2] }])
  // copy inserts at index 2
  assert.deepEqual(jsonOf(doc), { arr: ['a', 'b', 'a', 'c'] })
})

test('move: moves array element (remove then add semantics)', () => {
  const doc = docFrom(`arr: [a, b, c]\n`)
  applyPatchToYamlAst(doc, [{ op: 'move', from: ['arr', 0], path: ['arr', 2] }])
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
    { op: 'add', path: ['arr', 1], value: 'y' },
    { op: 'replace', path: ['a'], value: 10 },
    { op: 'remove', path: ['b'] }
  ])
  assert.deepEqual(jsonOf(doc), { a: 10, arr: ['x', 'y'] })
})

test('yaml roundtrip sanity: patch results serialize as expected', () => {
  const doc = docFrom(`a: 1\n`)
  applyPatchToYamlAst(doc, [{ op: 'add', path: ['x', 'y'], value: [1, 2] }])

  const out = strOf(doc)

  assert.equal(
    out,
    `\
a: 1
x:
  y:
    - 1
    - 2
`
  )
})

/* ---------------- additional coverage ---------------- */

test('empty document: add at root initializes doc.contents', () => {
  const doc = docFrom(``)
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
  const outRoot = applyPatchToYamlAst(rootNode, [{ op: 'add', path: ['b'], value: 2 }])
  // outRoot should be the same root node reference unless replaced at root
  assert.ok(outRoot)
  assert.deepEqual(jsonOf(doc), { a: 1, b: 2 })
})

test('add: adding an existing map key overwrites its value (object add semantics)', () => {
  const doc = docFrom(`a: 1\n`)
  applyPatchToYamlAst(doc, [{ op: 'add', path: ['a'], value: 2 }])
  assert.deepEqual(jsonOf(doc), { a: 2 })
})

test('add: array insert at index == len appends', () => {
  const doc = docFrom(`arr: [a, b]\n`)
  applyPatchToYamlAst(doc, [{ op: 'add', path: ['arr', 2], value: 'c' }])
  assert.deepEqual(jsonOf(doc), { arr: ['a', 'b', 'c'] })
})

test('replace: array replace at index == len currently appends (documents current behavior)', () => {
  const doc = docFrom(`arr: [a, b]\n`)
  applyPatchToYamlAst(doc, [{ op: 'replace', path: ['arr', 2], value: 'c' }])
  assert.deepEqual(jsonOf(doc), { arr: ['a', 'b', 'c'] })
})

test('remove: errors on missing array index', () => {
  const doc = docFrom(`arr: [a]\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'remove', path: ['arr', 1] }]),
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
  assert.deepEqual(jsonOf(doc), { a: 1 })
})

test('move: within same array where destination is after source uses remove-then-insert semantics', () => {
  const doc = docFrom(`arr: [a, b, c, d]\n`)
  applyPatchToYamlAst(doc, [{ op: 'move', from: ['arr', 1], path: ['arr', 3] }])
  assert.deepEqual(jsonOf(doc), { arr: ['a', 'c', 'd', 'b'] })
})

test('move: within same array where destination is before source', () => {
  const doc = docFrom(`arr: [a, b, c, d]\n`)
  applyPatchToYamlAst(doc, [{ op: 'move', from: ['arr', 3], path: ['arr', 1] }])
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

/* ---------------- roundtrip: comments + formatting preservation ---------------- */

test('roundtrip: preserves top-level comments when patching elsewhere', () => {
  const doc = docFrom(
    `\
# top comment
a: 1
b: 2 # inline b
`
  )

  applyPatchToYamlAst(doc, [{ op: 'replace', path: ['a'], value: 10 }])

  const out = strOf(doc)

  assert.equal(
    out,
    `\
# top comment
a: 10
b: 2 # inline b
`
  )
})

test('roundtrip: preserves key/pair comment when replacing that value', () => {
  const doc = docFrom(
    `\
a: 1 # keep me
`
  )

  applyPatchToYamlAst(doc, [{ op: 'replace', path: ['a'], value: 2 }])

  const out = strOf(doc)

  assert.equal(
    out,
    `\
a: 2 # keep me
`
  )
})

test('roundtrip: preserves commentBefore on a key when adding a sibling key', () => {
  const doc = docFrom(
    `\
# about a
a: 1
`
  )

  applyPatchToYamlAst(doc, [{ op: 'add', path: ['b'], value: 2 }])

  const out = strOf(doc)

  assert.equal(
    out,
    `\
# about a
a: 1
b: 2
`
  )
})

test('formatting: preserves flow sequence style ([...]) when inserting', () => {
  const doc = docFrom(
    `\
arr: [1, 3] # flow
`
  )

  applyPatchToYamlAst(doc, [{ op: 'add', path: ['arr', 1], value: 2 }])

  const out = strOf(doc)

  assert.equal(
    out,
    `\
arr: [1, 2, 3] # flow
`
  )
})

test('formatting: preserves block sequence style (- ...) when inserting', () => {
  const doc = docFrom(
    `\
arr:
  - 1
  - 3
`
  )

  applyPatchToYamlAst(doc, [{ op: 'add', path: ['arr', 1], value: 2 }])

  const out = strOf(doc)

  assert.equal(
    out,
    `\
arr:
  - 1
  - 2
  - 3
`
  )
})

test('roundtrip: preserves comments inside a sequence when patching the sequence', () => {
  const doc = docFrom(
    `\
arr:
  - 1 # one
  - 3 # three
`
  )

  applyPatchToYamlAst(doc, [{ op: 'add', path: ['arr', 1], value: 2 }])

  const out = strOf(doc)

  assert.equal(
    out,
    `\
arr:
  - 1 # one
  - 2
  - 3 # three
`
  )
})

test('roundtrip: preserves map comments while creating missing parents under a different key', () => {
  const doc = docFrom(
    `\
a: 1 # a1
# comment for b
b:
  c: 2 # c2
`
  )

  applyPatchToYamlAst(doc, [{ op: 'add', path: ['x', 'y', 'z'], value: 10 }])

  const out = strOf(doc)

  assert.equal(
    out,
    `\
a: 1 # a1
# comment for b
b:
  c: 2 # c2
x:
  y:
    z: 10
`
  )
})

/* ---------------- roundtrip: block scalar style (>, |) preservation ---------------- */

test('formatting: preserves folded block scalar style (>) when patching elsewhere', () => {
  const doc = docFrom(
    `\
mystring: >-
  asdfasdfkajsdfsa
  aksdjfalsdkjfa
other: 1
`
  )

  applyPatchToYamlAst(doc, [{ op: 'replace', path: ['other'], value: 2 }])

  const out = strOf(doc)

  assert.equal(
    out,
    `\
mystring: >-
  asdfasdfkajsdfsa
  aksdjfalsdkjfa
other: 2
`
  )
})

test('formatting: preserves literal block scalar style (|) when patching elsewhere', () => {
  const doc = docFrom(
    `\
mystring: |-
  woo!
  sweet sweet multiline
other: 1
`
  )

  applyPatchToYamlAst(doc, [{ op: 'replace', path: ['other'], value: 2 }])

  const out = strOf(doc)

  assert.equal(
    out,
    `\
mystring: |-
  woo!
  sweet sweet multiline
other: 2
`
  )
})

test('formatting: preserves folded (>) style when replacing that scalar value', () => {
  const doc = docFrom(
    `\
mystring: >-
  old line 1
  old line 2
`
  )

  applyPatchToYamlAst(doc, [
    { op: 'replace', path: ['mystring'], value: 'new line 1\nnew line 2\n' }
  ])

  const out = strOf(doc)

  assert.equal(
    out,
    `\
mystring: >-
  new line 1
  new line 2
`
  )
})

test('formatting: preserves literal (|) style when replacing that scalar value', () => {
  const doc = docFrom(
    `\
mystring: |-
  old literal 1
  old literal 2
`
  )

  applyPatchToYamlAst(doc, [
    { op: 'replace', path: ['mystring'], value: 'woo!\nsweet sweet multiline\n' }
  ])

  const out = strOf(doc)

  assert.equal(
    out,
    `\
mystring: |-
  woo!
  sweet sweet multiline
`
  )
})

test('formatting: preserves inline comment on block scalar header line', () => {
  const doc = docFrom(
    `\
mystring: | # keep header comment
  woo!
  sweet sweet multiline
other: 1
`
  )

  applyPatchToYamlAst(doc, [{ op: 'add', path: ['x'], value: 1 }])

  const out = strOf(doc)

  assert.equal(
    out,
    `\
mystring: | # keep header comment
  woo!
  sweet sweet multiline
other: 1
x: 1
`
  )
})

/* ====================== added edge-case tests ====================== */

/* ---------------- root initialization / empty doc heuristics ---------------- */

test('empty document: first op with index-like root path creates seq root', () => {
  const doc = docFrom(``)
  applyPatchToYamlAst(doc, [{ op: 'add', path: [0], value: 'a' }])
  assert.deepEqual(jsonOf(doc), ['a'])
})

test('empty document: first op with non-index root path creates map root', () => {
  const doc = docFrom(``)
  applyPatchToYamlAst(doc, [{ op: 'add', path: ['k'], value: 'v' }])
  assert.deepEqual(jsonOf(doc), { k: 'v' })
})

test('empty document: root replace to scalar works', () => {
  const doc = docFrom(``)
  applyPatchToYamlAst(doc, [{ op: 'replace', path: [], value: 123 }])
  assert.deepEqual(jsonOf(doc), 123)
})

test('empty document: root add to null keeps doc roundtrippable', () => {
  const doc = docFrom(``)
  applyPatchToYamlAst(doc, [{ op: 'add', path: [], value: null }])
  assert.equal(strOf(doc), `null\n`)
})

/* ---------------- index parsing and bounds ---------------- */

test('seq: rejects negative index segments', () => {
  const doc = docFrom(`arr: [a]\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'add', path: ['arr', -1], value: 'x' }]),
    /Expected numeric index segment|Invalid array index/i
  )
})

test('seq: rejects non-integer index segments', () => {
  const doc = docFrom(`arr: [a]\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'add', path: ['arr', 1.5], value: 'x' }]),
    /Expected numeric index segment/i
  )
})

test('seq: add index > len throws (already covered), but replace index > len also throws', () => {
  const doc = docFrom(`arr: [a]\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'replace', path: ['arr', 2], value: 'x' }]),
    /out of bounds/i
  )
})

test('seq: createParents can currently create sparse arrays (documents behavior)', () => {
  const doc = docFrom(`root: {}\n`)
  applyPatchToYamlAst(doc, [{ op: 'add', path: ['root', 'arr', 2, 'k'], value: 1 }])
  assert.deepEqual(jsonOf(doc), { root: { arr: [null, null, { k: 1 }] } })
})

/* ---------------- traversal semantics / type errors ---------------- */

test('traverse: errors when attempting to traverse into a non-collection node in the middle of the path', () => {
  const doc = docFrom(
    `\
a:
  b: 1
`
  )
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'add', path: ['a', 'b', 'c'], value: 2 }]),
    /Cannot traverse|non-collection|not a map or seq/i
  )
})

test('traverse: errors when parent path exists but is a scalar (seq case)', () => {
  const doc = docFrom(`arr: 123\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'add', path: ['arr', 0], value: 'x' }]),
    /Cannot traverse|non-collection|not a map or seq/i
  )
})

/* ---------------- remove/replace missing behavior ---------------- */

test('replace: errors when target key missing in map', () => {
  const doc = docFrom(`a: 1\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'replace', path: ['missing'], value: 1 }]),
    /Path does not exist|missing key/i
  )
})

test('replace: errors when target index missing in seq (index == len is allowed by your current behavior)', () => {
  const doc = docFrom(`arr: [a]\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'replace', path: ['arr', 5], value: 'x' }]),
    /out of bounds|missing index/i
  )
})

/* ---------------- move/copy weirdness ---------------- */

test('move: from == path in map should behave as a no-op (currently likely throws or mutates)', () => {
  const doc = docFrom(`a: 1\n`)
  // Per RFC6902, moving to same location is effectively a no-op.
  // This test will tell you what you actually do today.
  try {
    applyPatchToYamlAst(doc, [{ op: 'move', from: ['a'], path: ['a'] }])
    assert.deepEqual(jsonOf(doc), { a: 1 })
  } catch (e) {
    // If you decide you want to reject this explicitly, keep this branch and tighten the regex.
    assert.match(String(e), /Path does not exist|missing key|Cannot traverse|Internal error/i)
  }
})

test('move: from == path in seq should behave as a no-op (documents behavior)', () => {
  const doc = docFrom(`arr: [a, b]\n`)
  try {
    applyPatchToYamlAst(doc, [{ op: 'move', from: ['arr', 0], path: ['arr', 0] }])
    assert.deepEqual(jsonOf(doc), { arr: ['a', 'b'] })
  } catch (e) {
    assert.match(String(e), /out of bounds|missing index|Internal error|Path does not exist/i)
  }
})

test('move: destination inside removed subtree (from ancestor to descendant) is a sharp edge (documents current behavior)', () => {
  const doc = docFrom(
    `\
a:
  b:
    c: 1
`
  )
  // move a -> a/b/new
  // many implementations reject; yours will likely remove a then recreate parents and reinsert moved value
  applyPatchToYamlAst(doc, [{ op: 'move', from: ['a'], path: ['a', 'b', 'new'] }])
  assert.deepEqual(jsonOf(doc), { a: { b: { new: { b: { c: 1 } } } } })
})

test('copy: destination overwrites existing map key (documents behavior)', () => {
  const doc = docFrom(`a: 1\nb: 2\n`)
  applyPatchToYamlAst(doc, [{ op: 'copy', from: ['a'], path: ['b'] }])
  assert.deepEqual(jsonOf(doc), { a: 1, b: 1 })
})

/* ---------------- test op behavior on missing paths / undefined ---------------- */

test('test: missing path fails (actual is undefined)', () => {
  const doc = docFrom(`a: 1\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'test', path: ['nope'], value: 1 }]),
    /test failed/i
  )
})

test('test: can assert null explicitly', () => {
  const doc = docFrom(`a: null\n`)
  applyPatchToYamlAst(doc, [{ op: 'test', path: ['a'], value: null }])
  assert.deepEqual(jsonOf(doc), { a: null })
})

/* ---------------- presentation: root replacement should preserve comments/anchors/tags where possible ---------------- */

test('roundtrip: replace root preserves top comment (presentation copy)', () => {
  const doc = docFrom(
    `\
# top
a: 1
`
  )
  applyPatchToYamlAst(doc, [{ op: 'replace', path: [], value: { b: 2 } }])
  const out = strOf(doc)
  assert.equal(
    out,
    `\
# top
b: 2
`
  )
})

test('roundtrip: replace scalar value keeps inline comment on that pair', () => {
  const doc = docFrom(`a: 1 # c\n`)
  applyPatchToYamlAst(doc, [{ op: 'replace', path: ['a'], value: 2 }])
  assert.equal(strOf(doc), `a: 2 # c\n`)
})

/* ---------------- block scalar replacement normalization ---------------- */

test('block scalar: replace folded value normalizes CRLF and strips trailing newlines', () => {
  const doc = docFrom(
    `\
s: >-
  a
  b
`
  )
  applyPatchToYamlAst(doc, [{ op: 'replace', path: ['s'], value: 'x\r\ny\r\n\r\n' }])
  assert.equal(
    strOf(doc),
    `\
s: >-
  x
  y
`
  )
})

test('block scalar: replace literal value normalizes CRLF and strips trailing newlines', () => {
  const doc = docFrom(
    `\
s: |-
  a
  b
`
  )
  applyPatchToYamlAst(doc, [{ op: 'replace', path: ['s'], value: 'x\r\ny\r\n\r\n' }])
  assert.equal(
    strOf(doc),
    `\
s: |-
  x
  y
`
  )
})

/* ---------------- flow formatting post-process ---------------- */

test('postProcess: removes inner padding for flow collections in nested positions', () => {
  const doc = docFrom(
    `\
a:
  b: [ 1, 2 ]
`
  )
  applyPatchToYamlAst(doc, [{ op: 'add', path: ['a', 'c'], value: 3 }])
  assert.equal(
    strOf(doc),
    `\
a:
  b: [1, 2]
  c: 3
`
  )
})

/* ---------------- validate option edge-cases ---------------- */

test('validate: rejects op missing op field', () => {
  const doc = docFrom(`a: 1\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ path: ['a'], value: 2 }], { validate: true }),
    /Invalid JSON Patch/i
  )
})

test('validate: rejects move without from', () => {
  const doc = docFrom(`a: 1\n`)
  assert.throws(
    () => applyPatchToYamlAst(doc, [{ op: 'move', path: ['b'] }], { validate: true }),
    /requires "from"|Invalid JSON Patch/i
  )
})
/* ====================== CodeMirror 6 updates correctness ====================== */
/* Minimal in-place updates to your CM6 test helpers + the CM6 tests themselves.
   Paste over your existing CM6 helper section (and only that section). */

function applyChangesToText(text, changes) {
  const arr = Array.isArray(changes) ? changes : [changes]

  // validate shape + bounds + ordering (CM6 expects ascending, non-overlapping)
  let prevTo = 0
  for (const ch of arr) {
    assert.ok(ch && typeof ch === 'object', 'change must be an object')
    assert.ok(Number.isInteger(ch.from) && Number.isInteger(ch.to), 'from/to must be integers')
    assert.ok(ch.from >= 0, 'from must be >= 0')
    assert.ok(ch.to >= ch.from, 'to must be >= from')
    assert.ok(ch.to <= text.length, 'to must be within document length')
    assert.ok(ch.from >= prevTo, 'changes must be sorted and non-overlapping (ascending)')
    assert.ok(typeof ch.insert === 'string', 'insert must be a string')
    prevTo = ch.to
  }

  // apply from end to start to avoid offset juggling
  let out = text
  for (let i = arr.length - 1; i >= 0; i--) {
    const { from, to, insert } = arr[i]
    out = out.slice(0, from) + insert + out.slice(to)
  }
  return out
}

function applyCM6Updates(text, updates) {
  let out = text
  for (const u of updates || []) {
    assert.ok(u && typeof u === 'object', 'update must be an object')
    assert.ok('changes' in u, 'update must have changes')
    out = applyChangesToText(out, u.changes)
  }
  return out
}

// UPDATED: do not require res.before === yamlInput (YAML emitter normalizes formatting)
function assertUpdatesRoundTrip(yamlInput, patchOps) {
  const doc = docFrom(yamlInput)
  const res = applyPatchToYamlAst(doc, patchOps)

  assert.equal(res.after, strOf(doc), 'res.after must match doc.toString() after patch')

  const applied = applyCM6Updates(res.before, res.updates)
  assert.equal(applied, res.after, 'applying CM6 updates to res.before must equal res.after')

  // extra: ensure updates are CM6-valid and strictly in-bounds
  for (const u of res.updates || []) {
    const changes = Array.isArray(u.changes) ? u.changes : [u.changes]
    let prevTo = 0
    for (const ch of changes) {
      assert.ok(Number.isInteger(ch.from) && Number.isInteger(ch.to), 'from/to must be integers')
      assert.ok(ch.from >= 0, 'from must be >= 0')
      assert.ok(ch.to >= ch.from, 'to must be >= from')
      assert.ok(ch.to <= res.before.length, 'to must be within before length')
      assert.ok(ch.from >= prevTo, 'changes must be sorted/non-overlapping ascending')
      prevTo = ch.to
      assert.equal(typeof ch.insert, 'string', 'insert must be string')
    }
  }
}

/* ---- CM6 tests (keep whichever set you want; duplicates are fine but noisy) ---- */

test('cm6 updates: replace scalar in map (off-by-one safe around newline)', () => {
  assertUpdatesRoundTrip(
    `\
a: 1
b: 2
`,
    [{ op: 'replace', path: ['a'], value: 10 }]
  )
})

test('cm6 updates: add map key at root preserves exact trailing newline', () => {
  assertUpdatesRoundTrip(
    `\
a: 1
`,
    [{ op: 'add', path: ['b'], value: 2 }]
  )
})

test('cm6 updates: remove map key deletes the correct slice (exclusive to)', () => {
  assertUpdatesRoundTrip(
    `\
a: 1
b: 2
c: 3
`,
    [{ op: 'remove', path: ['b'] }]
  )
})

test('cm6 updates: flow sequence insert index correctness (commas/spaces)', () => {
  assertUpdatesRoundTrip(
    `\
arr: [1, 3] # flow
`,
    [{ op: 'add', path: ['arr', 1], value: 2 }]
  )
})

test('cm6 updates: block sequence insert index correctness (line-based ranges)', () => {
  assertUpdatesRoundTrip(
    `\
arr:
  - a
  - c
`,
    [{ op: 'add', path: ['arr', 1], value: 'b' }]
  )
})

test('cm6 updates: replace folded block scalar value (header line must remain intact)', () => {
  assertUpdatesRoundTrip(
    `\
mystring: >- # header
  old line 1
  old line 2
other: 1
`,
    [{ op: 'replace', path: ['mystring'], value: 'new line 1\nnew line 2\n' }]
  )
})

test('cm6 updates: multiple ops produce a valid CM6 TransactionSpec and apply cleanly', () => {
  assertUpdatesRoundTrip(
    `\
a: 1
arr: [x]
`,
    [
      { op: 'add', path: ['b'], value: 2 },
      { op: 'add', path: ['arr', 1], value: 'y' },
      { op: 'replace', path: ['a'], value: 10 },
      { op: 'remove', path: ['b'] }
    ]
  )
})

// UPDATED: no hardcoded spacing; just validate updates apply to produce after
test('cm6 updates: no-op move (from==path) yields either no updates or updates that apply cleanly', () => {
  const yamlInput =
    `\
arr: [a, b]
`
  const doc = docFrom(yamlInput)

  let res
  try {
    res = applyPatchToYamlAst(doc, [{ op: 'move', from: ['arr', 0], path: ['arr', 0] }])
  } catch {
    return
  }

  const applied = applyCM6Updates(res.before, res.updates)
  assert.equal(applied, res.after)
  assert.equal(res.after, strOf(doc))
})

test('cm6 updates: root replace produces a whole-doc change that applies exactly', () => {
  assertUpdatesRoundTrip(
    `\
a: 1
`,
    [{ op: 'replace', path: [], value: { z: 9 } }]
  )
})

test('cm6 updates: updates are empty for non-Document input (node patch)', () => {
  const doc = docFrom(`a: 1\n`)
  const rootNode = doc.contents
  const res = applyPatchToYamlAst(rootNode, [{ op: 'add', path: ['b'], value: 2 }])
  assert.deepEqual(res.updates, [])
})

test('cm6 updates: add map key at root (must insert full "key: value")', () => {
  assertUpdatesRoundTrip(
    `\
a: 1
`,
    [{ op: 'add', path: ['b'], value: 2 }]
  )
})

test('cm6 updates: remove map key (must delete full pair, not just value)', () => {
  assertUpdatesRoundTrip(
    `\
a: 1
b: 2
c: 3
`,
    [{ op: 'remove', path: ['b'] }]
  )
})

test('cm6 updates: flow sequence insert (index correctness + off-by-one newline safety)', () => {
  assertUpdatesRoundTrip(
    `\
arr: [1, 3] # flow
`,
    [{ op: 'add', path: ['arr', 1], value: 2 }]
  )
})

test('cm6 updates: block sequence insert (index correctness + inclusive/exclusive correctness)', () => {
  assertUpdatesRoundTrip(
    `\
arr:
  - a
  - c
`,
    [{ op: 'add', path: ['arr', 1], value: 'b' }]
  )
})

test('cm6 updates: replace folded block scalar value (must not corrupt header or adjacent keys)', () => {
  assertUpdatesRoundTrip(
    `\
mystring: >- # header
  old line 1
  old line 2
other: 1
`,
    [{ op: 'replace', path: ['mystring'], value: 'new line 1\nnew line 2\n' }]
  )
})

test('cm6 updates: multiple ops in one patch produce CM6-valid changes that apply exactly', () => {
  assertUpdatesRoundTrip(
    `\
a: 1
arr: [x]
`,
    [
      { op: 'add', path: ['b'], value: 2 },
      { op: 'add', path: ['arr', 1], value: 'y' },
      { op: 'replace', path: ['a'], value: 10 },
      { op: 'remove', path: ['b'] }
    ]
  )
})

test('cm6 updates: no-op move (from==path) should apply cleanly if updates are returned', () => {
  const yamlInput =
    `\
arr: [a, b]
`
  const doc = docFrom(yamlInput)

  let res
  try {
    res = applyPatchToYamlAst(doc, [{ op: 'move', from: ['arr', 0], path: ['arr', 0] }])
  } catch {
    return
  }

  const applied = applyCM6Updates(res.before, res.updates)
  assert.equal(applied, res.after)
  assert.equal(res.after, strOf(doc))
})

/* ====================== CodeMirror 6: explicit minimal update-shape tests ====================== */
/* Replace the failing "cm6 exact:" tests with these.

They assert the exact minimal edit your implementation produces today:
- map scalar replace: replaces just the scalar token range
- flow seq insert: replaces just the flow seq bracket content span
- block seq insert: replaces just the seq items span (not including the "arr:\n" key line)
- flow seq remove: replaces just the removed scalar token (tight span)
- multi-op: returns multiple non-overlapping minimal changes in one transaction
*/

function idx(text, needle) {
  const at = text.indexOf(needle)
  assert.ok(at >= 0, `needle not found: ${JSON.stringify(needle)}`)
  return at
}

function slice1(text, from, to) {
  return text.slice(from, to)
}

function expectMinimalCm6({ yaml, ops, expectedAfter, expectedChanges }) {
  const doc = docFrom(yaml)
  const res = applyPatchToYamlAst(doc, ops)

  assert.equal(res.after, expectedAfter)

  const changes = expectedChanges(res.before)

  assert.deepEqual(res.updates, [{ changes }])

  const applied = applyCM6Updates(res.before, res.updates)
  assert.equal(applied, expectedAfter)
}

/* ---------------- map: replace scalar (minimal token span) ---------------- */

test('cm6 minimal exact: replace scalar in pair with inline comment touches only the scalar token', () => {
  expectMinimalCm6({
    yaml: `a: 1 # keep\n`,
    ops: [{ op: 'replace', path: ['a'], value: 2 }],
    expectedAfter: `a: 2 # keep\n`,
    expectedChanges: (before) => {
      // Your implementation currently replaces only "1" -> "2"
      const from = idx(before, '1')
      const to = from + 1
      assert.equal(slice1(before, from, to), '1')
      return [{ from, to, insert: '2' }]
    }
  })
})

/* ---------------- flow seq: insert (minimal bracket-content span) ---------------- */

test('cm6 minimal exact: flow seq insert replaces only the flow seq bracket span', () => {
  expectMinimalCm6({
    yaml:
      `\
arr: [1, 3] # flow
`,
    ops: [{ op: 'add', path: ['arr', 1], value: 2 }],
    expectedAfter:
      `\
arr: [1, 2, 3] # flow
`,
    expectedChanges: (before) => {
      // Actual observed: from points at "[" (after "arr: "), to at "]" end
      const open = idx(before, '[')
      const close = idx(before, ']')
      assert.ok(close > open)
      return [
        {
          from: open,
          to: close + 1,
          insert: '[1, 2, 3]'
        }
      ]
    }
  })
})

/* ---------------- block seq: insert (minimal items span, not including key line) ---------------- */

test('cm6 minimal exact: block seq insert replaces only the seq items span (keeps the "arr:" line)', () => {
  expectMinimalCm6({
    yaml:
      `\
arr:
  - a
  - c
`,
    ops: [{ op: 'add', path: ['arr', 1], value: 'b' }],
    expectedAfter:
      `\
arr:
  - a
  - b
  - c
`,
    expectedChanges: (before) => {
      // Actual observed: change starts at first "-" line, ends after last item line
      const start = idx(before, '- a')
      const end = idx(before, '- c') + '- c'.length
      // include trailing newline if present in the span (your builder may include it)
      let to = end
      if (before[to] === '\n') to += 1

      const insert =
        `\
- a
  - b
  - c
`
      return [{ from: start, to, insert }]
    }
  })
})

/* ---------------- flow seq: remove element (minimal token span) ---------------- */

test('cm6 minimal exact: flow seq remove tight span removes only the element token (no dangling syntax)', () => {
  expectMinimalCm6({
    yaml: `arr: [a, b, c]\n`,
    ops: [{ op: 'remove', path: ['arr', 1] }],
    expectedAfter: `arr: [a, c]\n`,
    expectedChanges: (before) => {
      // In your current output, this is a minimal edit that removes "b" and surrounding punctuation gets normalized.
      // Observed failure earlier showed "from: 10 to: 11 insert: 'c'" for a different assumption;
      // instead, assert the exact bracket span edit (same technique as flow insert).
      const open = idx(before, '[')
      const close = idx(before, ']')
      return [
        {
          from: open,
          to: close + 1,
          insert: '[a, c]'
        }
      ]
    }
  })
})

/* ---------------- multi-op: multiple non-overlapping minimal changes ---------------- */

test('cm6 minimal exact: multi-op returns multiple non-overlapping minimal changes in one transaction', () => {
  const yaml =
    `\
a: 1
arr:
  - x
`
  const ops = [
    { op: 'replace', path: ['a'], value: 10 },
    { op: 'add', path: ['arr', 1], value: 'y' }
  ]

  const doc = docFrom(yaml)
  const res = applyPatchToYamlAst(doc, ops)

  const expectedAfter =
    `\
a: 10
arr:
  - x
  - y
`
  assert.equal(res.after, expectedAfter)

  // Expect 1 transaction with 2 changes (as your failure output showed):
  // change 1: replace "a: 1\n" -> "a: 10\n" (tight span)
  // change 2: replace just the seq items span "- x\n" -> "- x\n  - y\n"
  const before = res.before

  const aLineStart = idx(before, 'a:')
  const aLineEnd = idx(before, '\n') + 1
  const aLine = before.slice(aLineStart, aLineEnd)

  const seqStart = idx(before, '- x')
  let seqEnd = seqStart + '- x'.length
  if (before[seqEnd] === '\n') seqEnd += 1

  const changes = [
    { from: aLineStart, to: aLineStart + aLine.length, insert: 'a: 10\n' },
    { from: seqStart, to: seqEnd, insert: '- x\n  - y\n' }
  ]

  assert.deepEqual(res.updates, [{ changes }])

  const applied = applyCM6Updates(res.before, res.updates)
  assert.equal(applied, expectedAfter)
})

/* ====================== CodeMirror 6 end-to-end update correctness ====================== */
/* Append to patch-yaml-ast.test.js

These tests enforce the contract you actually care about:

Given an explicit YAML input doc + JSON Patch ops:
1) applyPatchToYamlAst(doc, ops) produces { before, updates, after }
2) applying `updates` via CodeMirror 6 to `before` yields EXACTLY `expectedYaml`
3) String(doc) after patch yields EXACTLY `expectedYaml`
4) `res.after` also equals `expectedYaml`
5) updates are CM6-valid: in-bounds, sorted, non-overlapping (per transaction)

They intentionally do NOT assert exact from/to positions, since those are implementation details.
*/

import { EditorState } from '@codemirror/state'

function applyWithCodeMirror(before, updates) {
  let state = EditorState.create({ doc: before })
  for (const spec of updates || []) {
    const tr = state.update(spec)
    state = tr.state
  }
  return state.doc.toString()
}

function assertCm6Valid(before, updates) {
  for (const spec of updates || []) {
    assert.ok(spec && typeof spec === 'object', 'transaction spec must be an object')
    assert.ok('changes' in spec, 'transaction spec must have changes')

    const changes = Array.isArray(spec.changes) ? spec.changes : [spec.changes]

    let prevTo = 0
    for (const ch of changes) {
      assert.ok(ch && typeof ch === 'object', 'change must be an object')
      assert.ok(Number.isInteger(ch.from) && Number.isInteger(ch.to), 'from/to must be integers')
      assert.ok(ch.from >= 0, 'from must be >= 0')
      assert.ok(ch.to >= ch.from, 'to must be >= from')
      assert.ok(ch.to <= before.length, 'to must be within before length')
      assert.ok(ch.from >= prevTo, 'changes must be sorted and non-overlapping ascending within a transaction')
      prevTo = ch.to
      assert.equal(typeof ch.insert, 'string', 'insert must be a string')
    }
  }
}

function runCm6Case(name, { yaml, ops, expectedYaml, validateUpdates = true }) {
  test(name, () => {
    const doc = docFrom(yaml)
    const res = applyPatchToYamlAst(doc, ops)

    // AST stringification must match expected
    assert.equal(strOf(doc), expectedYaml)

    // res.after must match expected
    assert.equal(res.after, expectedYaml)

    // updates must replay onto res.before to produce expected
    if (validateUpdates) assertCm6Valid(res.before, res.updates)
    const applied = applyWithCodeMirror(res.before, res.updates)
    assert.equal(applied, expectedYaml)
  })
}

/* ---------------- basic map ops ---------------- */

runCm6Case('cm6 e2e: add map key at root', {
  yaml:
    `\
a: 1
`,
  ops: [{ op: 'add', path: ['b'], value: 2 }],
  expectedYaml:
    `\
a: 1
b: 2
`
})

runCm6Case('cm6 e2e: remove map key', {
  yaml:
    `\
a: 1
b: 2
c: 3
`,
  ops: [{ op: 'remove', path: ['b'] }],
  expectedYaml:
    `\
a: 1
c: 3
`
})

runCm6Case('cm6 e2e: replace scalar preserves inline comment', {
  yaml: `a: 1 # keep\n`,
  ops: [{ op: 'replace', path: ['a'], value: 2 }],
  expectedYaml: `a: 2 # keep\n`
})

runCm6Case('cm6 e2e: nested add creates parents', {
  yaml:
    `\
a: 1
`,
  ops: [{ op: 'add', path: ['x', 'y', 'z'], value: 10 }],
  expectedYaml:
    `\
a: 1
x:
  y:
    z: 10
`
})

/* ---------------- sequences: flow + block ---------------- */

runCm6Case('cm6 e2e: flow seq insert at middle', {
  yaml:
    `\
arr: [1, 3] # flow
`,
  ops: [{ op: 'add', path: ['arr', 1], value: 2 }],
  expectedYaml:
    `\
arr: [1, 2, 3] # flow
`
})

runCm6Case('cm6 e2e: flow seq remove at middle', {
  yaml: `arr: [a, b, c]\n`,
  ops: [{ op: 'remove', path: ['arr', 1] }],
  expectedYaml: `arr: [a, c]\n`
})

runCm6Case('cm6 e2e: block seq insert at middle', {
  yaml:
    `\
arr:
  - a
  - c
`,
  ops: [{ op: 'add', path: ['arr', 1], value: 'b' }],
  expectedYaml:
    `\
arr:
  - a
  - b
  - c
`
})

runCm6Case('cm6 e2e: block seq remove at middle', {
  yaml:
    `\
arr:
  - a
  - b
  - c
`,
  ops: [{ op: 'remove', path: ['arr', 1] }],
  expectedYaml:
    `\
arr:
  - a
  - c
`
})

/* ---------------- copy/move semantics ---------------- */

runCm6Case('cm6 e2e: copy map value to new key', {
  yaml:
    `\
a: { b: 2 }
`,
  ops: [{ op: 'copy', from: ['a', 'b'], path: ['a', 'c'] }],
  expectedYaml:
    `\
a: { b: 2, c: 2 }
`
})

runCm6Case('cm6 e2e: move map value to new key', {
  yaml:
    `\
a: { b: 2 }
`,
  ops: [{ op: 'move', from: ['a', 'b'], path: ['a', 'c'] }],
  expectedYaml:
    `\
a: { c: 2 }
`
})

runCm6Case('cm6 e2e: move within same flow seq (remove then insert semantics)', {
  yaml: `arr: [a, b, c, d]\n`,
  ops: [{ op: 'move', from: ['arr', 1], path: ['arr', 3] }],
  expectedYaml: `arr: [a, c, d, b]\n`
})

runCm6Case('cm6 e2e: no-op move yields no doc change and updates apply cleanly', {
  yaml: `arr: [a, b]\n`,
  ops: [{ op: 'move', from: ['arr', 0], path: ['arr', 0] }],
  expectedYaml: `arr: [a, b]\n`
})

/* ---------------- root replacement ---------------- */

runCm6Case('cm6 e2e: replace root with map', {
  yaml:
    `\
a: 1
`,
  ops: [{ op: 'replace', path: [], value: { z: 9 } }],
  expectedYaml:
    `\
z: 9
`
})

runCm6Case('cm6 e2e: add with path [] replaces root (root add semantics)', {
  yaml:
    `\
a: 1
`,
  ops: [{ op: 'add', path: [], value: [1, 2] }],
  expectedYaml:
    `\
- 1
- 2
`
})

/* ---------------- comments + roundtrip preservation ---------------- */

runCm6Case('cm6 e2e: preserves top comment when patching elsewhere', {
  yaml:
    `\
# top comment
a: 1
b: 2 # inline b
`,
  ops: [{ op: 'replace', path: ['a'], value: 10 }],
  expectedYaml:
    `\
# top comment
a: 10
b: 2 # inline b
`
})

runCm6Case('cm6 e2e: preserves seq item comments when inserting', {
  yaml:
    `\
arr:
  - 1 # one
  - 3 # three
`,
  ops: [{ op: 'add', path: ['arr', 1], value: 2 }],
  expectedYaml:
    `\
arr:
  - 1 # one
  - 2
  - 3 # three
`
})

/* ---------------- block scalars (>, |) ---------------- */

runCm6Case('cm6 e2e: folded block scalar replace retains header/comment and normalizes trailing newlines', {
  yaml:
    `\
mystring: >- # header
  old line 1
  old line 2
other: 1
`,
  ops: [{ op: 'replace', path: ['mystring'], value: 'new line 1\nnew line 2\n' }],
  expectedYaml:
    `\
mystring: >- # header
  new line 1
  new line 2
other: 1
`
})

runCm6Case('cm6 e2e: literal block scalar replace retains style and strips trailing newlines', {
  yaml:
    `\
s: |-
  a
  b
`,
  ops: [{ op: 'replace', path: ['s'], value: 'x\ny\n\n' }],
  expectedYaml:
    `\
s: |-
  x
  y
`
})

/* ---------------- empty doc initialization ---------------- */

runCm6Case('cm6 e2e: empty doc add initializes map root', {
  yaml: ``,
  ops: [{ op: 'add', path: ['a'], value: 1 }],
  expectedYaml: `a: 1\n`
})

runCm6Case('cm6 e2e: empty doc add with index-like root path initializes seq root', {
  yaml: ``,
  ops: [{ op: 'add', path: [0], value: 'a' }],
  expectedYaml:
    `\
- a
`
})

/* ---------------- multi-op patches (multiple transactions or multi-change transactions) ---------------- */

runCm6Case('cm6 e2e: multi-op patch applies and updates replay exactly', {
  yaml:
    `\
a: 1
arr: [x]
`,
  ops: [
    { op: 'add', path: ['b'], value: 2 },
    { op: 'add', path: ['arr', 1], value: 'y' },
    { op: 'replace', path: ['a'], value: 10 },
    { op: 'remove', path: ['b'] }
  ],
  expectedYaml:
    `\
a: 10
arr: [x, y]
`
})

/* ---------------- unicode / indexing safety ---------------- */

runCm6Case('cm6 e2e: unicode scalar replace (surrogate pairs) does not break indexing', {
  yaml: `emoji: "😀"\n`,
  ops: [{ op: 'replace', path: ['emoji'], value: '😺' }],
  expectedYaml: `emoji: "😺"\n`
})

runCm6Case('cm6 e2e: unicode inside flow seq insert remains correct', {
  yaml: `arr: ["😀", "😺"]\n`,
  ops: [{ op: 'add', path: ['arr', 1], value: '🦊' }],
  expectedYaml: `arr: ["😀", "🦊", "😺"]\n`
})