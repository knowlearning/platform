// add to your realworld.2 test file (or a new one)
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

describe('adversarial: flow sequence with trailing inline comment', () => {
  test('append to flow sequence should preserve trailing comment placement', () => {
    assert.equal(
      applyPatches(`\
recent: [a, b] # keep
`, [{ op: 'add', path: ['recent', 99], value: 'c' }]),
      `\
recent: [a, b, c] # keep
`
    )
  })

  test('remove from flow sequence should preserve trailing comment placement', () => {
    assert.equal(
      applyPatches(`\
recent: [a, b, c] # keep
`, [{ op: 'remove', path: ['recent', 1] }]),
      `\
recent: [a, c] # keep
`
    )
  })

  test('add to comment-only YAML should append key after comment block', () => {
    assert.equal(
      applyPatches(`\
# config for my app
# generated on first run
`, [{ op: 'add', path: ['a'], value: 1 }]),
      `\
# config for my app
# generated on first run
a: 1
`
    )
  })

  test('add to doc-marker + comments only should still create first key', () => {
    assert.equal(
      applyPatches(`\
---
# doc header
# still no keys
`, [{ op: 'add', path: ['a'], value: 1 }]),
      `\
---
# doc header
# still no keys
a: 1
`
    )
  })
})