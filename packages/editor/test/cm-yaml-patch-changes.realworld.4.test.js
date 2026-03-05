import test from 'node:test'
import assert from 'node:assert/strict'

import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { yaml } from '@codemirror/lang-yaml'

import cmYAMLPatchChanges from '../cm-yaml-patch-changes.js' // adjust path if needed

function apply(docText, patch) {
  const state = EditorState.create({ doc: docText, extensions: [yaml()] })
  const tree = ensureSyntaxTree(state, docText.length)
  assert.ok(tree, 'expected syntax tree')
  const changes = cmYAMLPatchChanges(tree.topNode, docText, patch)
  if (!changes.length) return docText
  // your cmYAMLPatchChanges returns a single whole-doc replacement
  assert.equal(changes.length, 1)
  const c = changes[0]
  return docText.slice(0, c.from) + c.insert + docText.slice(c.to)
}

test('real-world 4: fairness fails', async t => {
  await t.test('replace key itself should not silently noop (requires move/rename semantics)', () => {
    // Fair: user renames a key in settings
    // JSON Patch cannot "rename" without remove+add, but people still try.
    // If your implementation treats path as value-only, this will noop or corrupt.
    const input = 'settings:\n  theme: dark\n'
    const patch = [{ op: 'replace', path: ['settings', 'theme'], value: { name: 'dark' } }]
    const out = apply(input, patch)
    // Expected: valid YAML. This should become a map under theme.
    // Many implementations accidentally produce "theme: name: dark" or break indentation/comments.
    assert.equal(out, 'settings:\n  theme:\n    name: dark\n')
  })

  await t.test('add into a key that currently maps to a scalar should be a no-op (JSON Patch semantics)', () => {
    // Fair: UI tries to add nested preference under a scalar by mistake.
    // JSON Patch says "add" to a non-container parent should fail; your tool chooses "no-op".
    const input = 'prefs: on\n'
    const patch = [{ op: 'add', path: ['prefs', 'nested'], value: 1 }]
    const out = apply(input, patch)
    // If your code tries to coerce scalar into map, that violates your earlier "no-op if parent missing" stance.
    assert.equal(out, input)
  })

  await t.test('comment-only prelude + existing BOM should preserve BOM and still insert after prelude', () => {
    // Fair: windows-ish files sometimes have BOM + comment prelude.
    const bom = '\uFEFF'
    const input = `${bom}# header\n# more\n`
    const patch = [{ op: 'add', path: ['a'], value: 1 }]
    const out = apply(input, patch)
    // A fair expectation is: BOM stays at file start, insertion after comment block.
    assert.equal(out, `${bom}# header\n# more\na: 1\n`)
  })

  await t.test('flow mapping with trailing inline comment: add key should keep comment attached to line', () => {
    // Fair: compact state uses flow mappings with end-of-line comment.
    // Your flow add likely inserts before '}' but might move/duplicate the comment.
    const input = 'state: { a: 1 } # keep\n'
    const patch = [{ op: 'add', path: ['state', 'b'], value: 2 }]
    const out = apply(input, patch)
    // Expected keeps comment exactly at end of line.
    assert.equal(out, 'state: { a: 1, b: 2 } # keep\n')
  })

  await t.test('flow sequence with trailing inline comment: remove middle should keep comment and spacing canonical', () => {
    // Fair: list in flow form with trailing comment.
    const input = 'items: [a, b, c] # keep\n'
    const patch = [{ op: 'remove', path: ['items', 1] }]
    const out = apply(input, patch)
    assert.equal(out, 'items: [a, c] # keep\n')
  })

  await t.test('block scalar with chomping/indent indicators should not be rewritten unless necessary', () => {
    // Fair: config files rely on exact block scalar style.
    // Your code always rewrites multi-line strings to "|-" which is semantically close but not identical in formatting.
    const input = 'a: |+\n  line1\n  \n'
    const patch = [{ op: 'replace', path: ['a'], value: 'line1\n' }]
    const out = apply(input, patch)
    // A "fair" expectation for a formatting-preserving patcher:
    // keep scalar style if possible. Your implementation likely outputs a plain scalar or "|-" style.
    // This test intentionally codifies preservation.
    assert.equal(out, 'a: |+\n  line1\n  \n')
  })

  await t.test('sequence item that is a flow map: add key inside should stay flow map (not spill into block)', () => {
    // Fair: compact list of objects often stored as flow maps.
    const input = 'items:\n  - { a: 1 }\n'
    const patch = [{ op: 'add', path: ['items', 0, 'b'], value: 2 }]
    const out = apply(input, patch)
    // Expected stays flow map, not converted to block mapping.
    assert.equal(out, 'items:\n  - { a: 1, b: 2 }\n')
  })

  await t.test('CRLF preservation end-to-end across sequential ops', () => {
    // Fair: windows config files.
    // Some implementations preserve CRLF per-op but lose it when returning whole-doc replacement.
    const input = 'a: 1\r\nb: 2\r\n'
    const patch = [
      { op: 'replace', path: ['a'], value: 9 },
      { op: 'add', path: ['c'], value: 3 }
    ]
    const out = apply(input, patch)
    assert.equal(out, 'a: 9\r\nb: 2\r\nc: 3\r\n')
  })
})