// These tests are intentionally adversarial and cover syntax-edge cases, formatting hazards,
// and “looks-like-a-path” gotchas (numeric keys, quoted keys, etc)

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

describe('adversarial: formatting + whitespace hazards', () => {
  test('add to map when last line has trailing spaces', () => {
    assert.equal(
      applyPatches(`\
a: 1    
`, [{ op: 'add', path: ['b'], value: 'x' }]),
      `\
a: 1    
b: x
`
    )
  })

  test('add to map when file does not end with newline', () => {
    assert.equal(
      applyPatches(`a: 1`, [{ op: 'add', path: ['b'], value: 'x' }]),
      `a: 1
b: x
`
    )
  })

  test('add to nested map when nested block does not end with newline', () => {
    assert.equal(
      applyPatches(`\
a:
  b: 1`, [{ op: 'add', path: ['a', 'c'], value: 2 }]),
      `\
a:
  b: 1
  c: 2
`
    )
  })

  test('remove key preserves surrounding blank lines correctly', () => {
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

  test('remove key at EOF when file lacks trailing newline', () => {
    assert.equal(
      applyPatches(`a: 1\nb: 2`, [{ op: 'remove', path: ['b'] }]),
      `a: 1
`
    )
  })

  test('replace preserves surrounding whitespace (only replaces scalar span)', () => {
    assert.equal(
      applyPatches(`\
a:    1
`, [{ op: 'replace', path: ['a'], value: 2 }]),
      `\
a:    2
`
    )
  })
})

describe('adversarial: comments, directives, and document markers', () => {
  test('replace value with inline comment present', () => {
    assert.equal(
      applyPatches(`\
a: 1 # keep me
`, [{ op: 'replace', path: ['a'], value: 2 }]),
      `\
a: 2 # keep me
`
    )
  })

  test('remove key that has inline comment', () => {
    assert.equal(
      applyPatches(`\
a: 1 # comment
b: 2
`, [{ op: 'remove', path: ['a'] }]),
      `\
b: 2
`
    )
  })

  test('add key under document marker ---', () => {
    assert.equal(
      applyPatches(`\
---
a: 1
`, [{ op: 'add', path: ['b'], value: 2 }]),
      `\
---
a: 1
b: 2
`
    )
  })

  test('replace in presence of leading comment block', () => {
    assert.equal(
      applyPatches(`\
# header comment
# another comment
a: 1
`, [{ op: 'replace', path: ['a'], value: 2 }]),
      `\
# header comment
# another comment
a: 2
`
    )
  })

  test('add key when last node is followed by comment-only lines', () => {
    assert.equal(
      applyPatches(`\
a: 1
# tail comment
`, [{ op: 'add', path: ['b'], value: 2 }]),
      `\
a: 1
# tail comment
b: 2
`
    )
  })
})

describe('adversarial: keys that look tricky', () => {
  test('numeric-looking key stays a map key (string path segment)', () => {
    assert.equal(
      applyPatches(`\
01: a
`, [{ op: 'replace', path: ['01'], value: 'b' }]),
      `\
01: b
`
    )
  })

  test('key that requires quoting in YAML output', () => {
    assert.equal(
      applyPatches(`\
a: 1
`, [{ op: 'add', path: ['has:colon'], value: 2 }]),
      `\
a: 1
"has:colon": 2
`
    )
  })

  test('key with leading/trailing spaces (quoted in source) is addressable by exact slice text', () => {
    assert.equal(
      applyPatches(`\
" spaced ": 1
`, [{ op: 'replace', path: ['" spaced "'], value: 2 }]),
      `\
" spaced ": 2
`
    )
  })

  test('quoted key with escape sequences', () => {
    assert.equal(
      applyPatches(`\
"line\\nbreak": 1
`, [{ op: 'replace', path: ['"line\\nbreak"'], value: 2 }]),
      `\
"line\\nbreak": 2
`
    )
  })

  test('merge key << is treated as normal key when addressed explicitly', () => {
    assert.equal(
      applyPatches(`\
"<<": 1
`, [{ op: 'replace', path: ['"<<": 1'.includes('<<') ? '<<' : '<<'], value: 2 }]),
      `\
"<<": 1
`
    )
  })
})

describe('adversarial: sequences and mixed structures', () => {
  test('add to sequence when file has no trailing newline', () => {
    assert.equal(
      applyPatches(`items:\n  - a\n  - b`, [{ op: 'add', path: ['items', 2], value: 'c' }]),
      `items:
  - a
  - b
  - c
`
    )
  })

  test('remove middle item in sequence of maps', () => {
    assert.equal(
      applyPatches(`\
items:
  - k: 1
  - k: 2
  - k: 3
`, [{ op: 'remove', path: ['items', 1] }]),
      `\
items:
  - k: 1
  - k: 3
`
    )
  })

  test('replace scalar inside sequence of maps', () => {
    assert.equal(
      applyPatches(`\
items:
  - k: 1
  - k: 2
`, [{ op: 'replace', path: ['items', 1, 'k'], value: 99 }]),
      `\
items:
  - k: 1
  - k: 99
`
    )
  })

  test('add new key into map element inside sequence', () => {
    assert.equal(
      applyPatches(`\
items:
  - a: 1
  - a: 2
`, [{ op: 'add', path: ['items', 0, 'b'], value: 3 }]),
      `\
items:
  - a: 1
    b: 3
  - a: 2
`
    )
  })

  test('remove key inside map element inside sequence', () => {
    assert.equal(
      applyPatches(`\
items:
  - a: 1
    b: 2
`, [{ op: 'remove', path: ['items', 0, 'a'] }]),
      `\
items:
  - b: 2
`
    )
  })

  test('add item to empty sequence block (degenerate but common)', () => {
    assert.equal(
      applyPatches(`\
items:
`, [{ op: 'add', path: ['items', 0], value: 'x' }]),
      `\
items:
  - x
`
    )
  })

  test('remove only item from sequence with trailing comment', () => {
    assert.equal(
      applyPatches(`\
items:
  - only # comment
`, [{ op: 'remove', path: ['items', 0] }]),
      `\
items:
`
    )
  })
})

describe('adversarial: flow style YAML (inline maps/sequences)', () => {
  test('replace value in flow map', () => {
    assert.equal(
      applyPatches(`\
a: { b: 1, c: 2 }
`, [{ op: 'replace', path: ['a', 'b'], value: 9 }]),
      `\
a: { b: 9, c: 2 }
`
    )
  })

  test('replace value in flow sequence', () => {
    assert.equal(
      applyPatches(`\
items: [a, b, c]
`, [{ op: 'replace', path: ['items', 1], value: 'x' }]),
      `\
items: [a, x, c]
`
    )
  })

  test('remove key from flow map', () => {
    assert.equal(
      applyPatches(`\
a: { b: 1, c: 2 }
`, [{ op: 'remove', path: ['a', 'b'] }]),
      `\
a: { c: 2 }
`
    )
  })

  test('add key to flow map appends cleanly', () => {
    assert.equal(
      applyPatches(`\
a: { b: 1 }
`, [{ op: 'add', path: ['a', 'c'], value: 2 }]),
      `\
a: { b: 1, c: 2 }
`
    )
  })
})

describe('adversarial: multi-line scalars and block structures', () => {
  test('replace block scalar (literal) with plain string', () => {
    assert.equal(
      applyPatches(`\
a: |
  hello
  world
`, [{ op: 'replace', path: ['a'], value: 'x' }]),
      `\
a: x
`
    )
  })

  test('replace plain string with literal block scalar', () => {
    assert.equal(
      applyPatches(`\
a: x
`, [{ op: 'replace', path: ['a'], value: 'hello\nworld\n' }]),
      `\
a: |-
  hello
  world
`
    )
  })

  test('add value that stringifies to multi-line YAML (map)', () => {
    assert.equal(
      applyPatches(`\
a: 1
`, [{ op: 'add', path: ['obj'], value: { x: 1, y: 2 } }]),
      `\
a: 1
obj:
  x: 1
  y: 2
`
    )
  })

  test('add sequence item that is an object (multi-line)', () => {
    assert.equal(
      applyPatches(`\
items:
  - a
`, [{ op: 'add', path: ['items', 1], value: { x: 1, y: 2 } }]),
      `\
items:
  - a
  - x: 1
    y: 2
`
    )
  })

  test('add nested key where value is array (multi-line)', () => {
    assert.equal(
      applyPatches(`\
a:
  b: 1
`, [{ op: 'add', path: ['a', 'list'], value: ['x', 'y'] }]),
      `\
a:
  b: 1
  list:
    - x
    - y
`
    )
  })
})

describe('adversarial: atomicity + overlapping changes', () => {
  test('add then remove a different key does not corrupt insert position', () => {
    assert.equal(
      applyPatches(`\
a: 1
b: 2
`, [
        { op: 'add', path: ['c'], value: 3 },
        { op: 'remove', path: ['b'] }
      ]),
      `\
a: 1
c: 3
`
    )
  })

  test('remove then add at end (same parent) still yields coherent output', () => {
    assert.equal(
      applyPatches(`\
a: 1
b: 2
c: 3
`, [
        { op: 'remove', path: ['b'] },
        { op: 'add', path: ['d'], value: 4 }
      ]),
      `\
a: 1
c: 3
d: 4
`
    )
  })

  test('multiple adds to same map preserve stable ordering (in patch order)', () => {
    assert.equal(
      applyPatches(`\
a: 1
`, [
        { op: 'add', path: ['b'], value: 2 },
        { op: 'add', path: ['c'], value: 3 },
        { op: 'add', path: ['d'], value: 4 }
      ]),
      `\
a: 1
b: 2
c: 3
d: 4
`
    )
  })

  test('replace + add + replace on different nodes uses original tree coordinates safely', () => {
    assert.equal(
      applyPatches(`\
a: 1
b: 2
`, [
        { op: 'replace', path: ['a'], value: 10 },
        { op: 'add', path: ['c'], value: 30 },
        { op: 'replace', path: ['b'], value: 20 }
      ]),
      `\
a: 10
b: 20
c: 30
`
    )
  })

  test('remove key that is above where an add will occur (position shift adversary)', () => {
    assert.equal(
      applyPatches(`\
a: 1
b: 2
c: 3
`, [
        { op: 'remove', path: ['a'] },
        { op: 'add', path: ['d'], value: 4 }
      ]),
      `\
b: 2
c: 3
d: 4
`
    )
  })

  test('sequence: remove earlier item then add at end (should still append)', () => {
    assert.equal(
      applyPatches(`\
items:
  - a
  - b
  - c
`, [
        { op: 'remove', path: ['items', 0] },
        { op: 'add', path: ['items', 99], value: 'z' }
      ]),
      `\
items:
  - b
  - c
  - z
`
    )
  })
})

/**
 * NOTE:
 * Some of the multi-line value add tests above represent “ideal” formatting.
 * If your current implementation emits `key: <multi-line-yaml>` on one line (invalid),
 * those tests will fail and are intentionally signaling a robustness gap.
 *
 * If you want, I can adjust the module to:
 * - detect `valueYaml.includes('\n')`
 * - emit `key:\n<indented block>` and `- <indented block>` correctly
 * while preserving CodeMirror-tree-based targeting.
 */