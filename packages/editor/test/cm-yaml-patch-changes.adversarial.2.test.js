// More adversarial tests: anchors, directives, multi-doc streams, flow sequences, CRLF, tabs, complex keys

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

  let result = yamlText
  for (let i = changes.length - 1; i >= 0; i--) {
    const { from, to, insert } = changes[i]
    result = result.slice(0, from) + insert + result.slice(to)
  }
  return result
}

describe('more adversarial: directives + multi-document streams', () => {
  test('add under directives + comment prelude', () => {
    assert.equal(
      applyPatches(`\
%YAML 1.2
%TAG !e! tag:example.com,2000:app/
# header
---
a: 1
`, [{ op: 'add', path: ['b'], value: 2 }]),
      `\
%YAML 1.2
%TAG !e! tag:example.com,2000:app/
# header
---
a: 1
b: 2
`
    )
  })

  test('replace in first doc of a multi-doc stream (should not touch second doc)', () => {
    assert.equal(
      applyPatches(`\
---
a: 1
...
---
a: 9
`, [{ op: 'replace', path: ['a'], value: 2 }]),
      // NOTE: depending on how CodeMirror exposes the tree, this may currently replace the first or fail entirely.
      // Ideal behavior: only patch the first document (tree root doc).
      `\
---
a: 2
...
---
a: 9
`
    )
  })

  test('add to doc that ends with explicit document end marker ...', () => {
    assert.equal(
      applyPatches(`\
---
a: 1
...
`, [{ op: 'add', path: ['b'], value: 2 }]),
      `\
---
a: 1
b: 2
...
`
    )
  })
})

describe('more adversarial: anchors, aliases, merge keys', () => {
  test('replace anchored scalar', () => {
    assert.equal(
      applyPatches(`\
a: &x 1
b: *x
`, [{ op: 'replace', path: ['a'], value: 2 }]),
      // Keeping anchor tokenization stable is hard; at minimum it should not corrupt syntax.
      // Depending on node spans, you might get "&x 2" or lose the anchor.
      `\
a: &x 2
b: *x
`
    )
  })

  test('replace alias target used elsewhere', () => {
    assert.equal(
      applyPatches(`\
defaults: &def
  k: 1
use:
  <<: *def
`, [{ op: 'replace', path: ['defaults', 'k'], value: 2 }]),
      `\
defaults: &def
  k: 2
use:
  <<: *def
`
    )
  })

  test('remove merge key << inside mapping', () => {
    assert.equal(
      applyPatches(`\
use:
  <<: { a: 1 }
  b: 2
`, [{ op: 'remove', path: ['use', '<<'] }]),
      `\
use:
  b: 2
`
    )
  })
})

describe('more adversarial: flow sequences (inline lists) add/remove', () => {
  test('remove middle item from flow sequence preserves spacing', () => {
    assert.equal(
      applyPatches(`\
items: [a, b, c]
`, [{ op: 'remove', path: ['items', 1] }]),
      // ideal: keep canonical spacing
      `\
items: [a, c]
`
    )
  })

  test('remove first item from flow sequence', () => {
    assert.equal(
      applyPatches(`\
items: [a, b, c]
`, [{ op: 'remove', path: ['items', 0] }]),
      `\
items: [b, c]
`
    )
  })

  test('remove last item from flow sequence', () => {
    assert.equal(
      applyPatches(`\
items: [a, b, c]
`, [{ op: 'remove', path: ['items', 2] }]),
      `\
items: [a, b]
`
    )
  })

  test('add to flow sequence appends (index past end)', () => {
    assert.equal(
      applyPatches(`\
items: [a, b]
`, [{ op: 'add', path: ['items', 99], value: 'c' }]),
      // ideal behavior: add inside brackets, not as a new block line
      `\
items: [a, b, c]
`
    )
  })

  test('add to empty flow sequence', () => {
    assert.equal(
      applyPatches(`\
items: []
`, [{ op: 'add', path: ['items', 0], value: 'x' }]),
      `\
items: [x]
`
    )
  })
})

describe('more adversarial: comments in pathological positions', () => {
  test('replace value when comment sits between key token and value', () => {
    assert.equal(
      applyPatches(`\
a: # hi
  1
`, [{ op: 'replace', path: ['a'], value: 2 }]),
      `\
a: # hi
  2
`
    )
  })

  test('remove key with preceding comment and ensure comment stays', () => {
    assert.equal(
      applyPatches(`\
# keep
a: 1
b: 2
`, [{ op: 'remove', path: ['a'] }]),
      `\
# keep
b: 2
`
    )
  })

  test('flow map with inline comment after a pair removal', () => {
    assert.equal(
      applyPatches(`\
a: { b: 1, c: 2 } # tail
`, [{ op: 'remove', path: ['a', 'b'] }]),
      `\
a: { c: 2 } # tail
`
    )
  })
})

describe('more adversarial: CRLF + tabs', () => {
  test('CRLF document: replace should preserve CRLF structure', () => {
    assert.equal(
      applyPatches('a: 1\r\nb: 2\r\n', [{ op: 'replace', path: ['a'], value: 9 }]),
      'a: 9\r\nb: 2\r\n'
    )
  })

  test('tab-indented YAML (non-canonical but seen): add nested key', () => {
    assert.equal(
      applyPatches('a:\n\tb: 1\n', [{ op: 'add', path: ['a', 'c'], value: 2 }]),
      // your indentation helpers assume spaces; this test may expose drift or mixed indentation
      'a:\n\tb: 1\n\tc: 2\n'
    )
  })
})

describe('more adversarial: complex keys and non-scalar replacements', () => {
  test('replace mapping node with scalar', () => {
    assert.equal(
      applyPatches(`\
a:
  b: 1
`, [{ op: 'replace', path: ['a'], value: 2 }]),
      `\
a: 2
`
    )
  })

  test('replace scalar with mapping node', () => {
    assert.equal(
      applyPatches(`\
a: 1
`, [{ op: 'replace', path: ['a'], value: { b: 2 } }]),
      // ideal: multi-line replacement should be valid YAML and correctly indented
      `\
a:
  b: 2
`
    )
  })

  test('add key where parent is flow mapping nested inside a sequence item', () => {
    assert.equal(
      applyPatches(`\
items:
  - { a: 1 }
`, [{ op: 'add', path: ['items', 0, 'b'], value: 2 }]),
      `\
items:
  - { a: 1, b: 2 }
`
    )
  })

  test('complex key (flow key) addressability is stable', () => {
    assert.equal(
      applyPatches(`\
? [a, b]
: 1
`, [{ op: 'replace', path: ['[a, b]'], value: 2 }]),
      // Depending on CodeMirror key spans, this may fail today. If it fails, you’ve found a real limitation:
      // key matching is slice-based, not YAML-parse-based.
      `\
? [a, b]
: 2
`
    )
  })
})

describe('more adversarial: block scalars beyond "|-"', () => {
  test('replace folded block scalar (>) with plain scalar', () => {
    assert.equal(
      applyPatches(`\
a: >
  hello
  world
`, [{ op: 'replace', path: ['a'], value: 'x' }]),
      `\
a: x
`
    )
  })

  test('replace scalar with literal block scalar + keep indentation indicator stable-ish', () => {
    assert.equal(
      applyPatches(`\
a: x
`, [{ op: 'replace', path: ['a'], value: 'hello\nworld' }]),
      `\
a: |-
  hello
  world
`
    )
  })
})