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

describe('incremental parsing – multi-op correctness', () => {
  test('two replaces, second key after first', () => {
    const doc = 'a: 1\nb: 2\nc: 3\n'
    const result = applyPatches(doc, [
      { op: 'replace', path: ['a'], value: 'longvalue' },
      { op: 'replace', path: ['c'], value: 99 },
    ])
    const parsed = YAML.parse(result)
    assert.equal(parsed.a, 'longvalue')
    assert.equal(parsed.b, 2)
    assert.equal(parsed.c, 99)
  })

  test('add then replace on same map', () => {
    const doc = 'a: 1\nb: 2\n'
    const result = applyPatches(doc, [
      { op: 'add', path: ['prefix'], value: 'inserted' },
      { op: 'replace', path: ['b'], value: 99 },
    ])
    const parsed = YAML.parse(result)
    assert.equal(parsed.prefix, 'inserted')
    assert.equal(parsed.b, 99)
    assert.equal(parsed.a, 1)
  })

  test('remove then replace on remaining key', () => {
    const doc = 'x: 10\ny: 20\nz: 30\n'
    const result = applyPatches(doc, [
      { op: 'remove', path: ['x'] },
      { op: 'replace', path: ['z'], value: 'changed' },
    ])
    const parsed = YAML.parse(result)
    assert.equal(parsed.x, undefined)
    assert.equal(parsed.y, 20)
    assert.equal(parsed.z, 'changed')
  })

  test('add multiple sequence items sequentially', () => {
    const doc = 'items:\n  - item0\n  - item1\n'
    const result = applyPatches(doc, [
      { op: 'add', path: ['items', 99], value: 'appended0' },
      { op: 'add', path: ['items', 99], value: 'appended1' },
      { op: 'add', path: ['items', 99], value: 'appended2' },
    ])
    const parsed = YAML.parse(result)
    assert.ok(Array.isArray(parsed.items))
    assert.equal(parsed.items.length, 5)
    assert.ok(parsed.items.includes('appended0'))
    assert.ok(parsed.items.includes('appended1'))
    assert.ok(parsed.items.includes('appended2'))
  })

  test('replace short value with long value, then replace next key', () => {
    const doc = 'a: x\nb: y\nc: z\n'
    const result = applyPatches(doc, [
      { op: 'replace', path: ['a'], value: 'a-very-long-replacement-value' },
      { op: 'replace', path: ['b'], value: 'also-replaced' },
    ])
    const parsed = YAML.parse(result)
    assert.equal(parsed.a, 'a-very-long-replacement-value')
    assert.equal(parsed.b, 'also-replaced')
    assert.equal(parsed.c, 'z')
  })

  test('replace with multiline block scalar, then replace next key', () => {
    const doc = 'title: hello\ndescription: short\nfooter: end\n'
    const multiline = 'line one\nline two\nline three\nline four\nline five'
    const result = applyPatches(doc, [
      { op: 'replace', path: ['description'], value: multiline },
      { op: 'replace', path: ['footer'], value: 'updated-footer' },
    ])
    const parsed = YAML.parse(result)
    assert.equal(parsed.title, 'hello')
    assert.equal(parsed.footer, 'updated-footer')
    // Value should contain the multiline content
    assert.ok(parsed.description.includes('line one'))
    assert.ok(parsed.description.includes('line five'))
  })

  test('mixed: add + remove + replace in one patch', () => {
    const doc = 'keep: true\nremove_me: old\nupdate_me: before\n'
    const result = applyPatches(doc, [
      { op: 'add', path: ['new_key'], value: 'added' },
      { op: 'remove', path: ['remove_me'] },
      { op: 'replace', path: ['update_me'], value: 'after' },
    ])
    const parsed = YAML.parse(result)
    assert.equal(parsed.keep, true)
    assert.equal(parsed.new_key, 'added')
    assert.equal(parsed.remove_me, undefined)
    assert.equal(parsed.update_me, 'after')
  })

  test('large document: many ops, verify YAML semantic equality', () => {
    const lines = []
    for (let i = 0; i < 30; i++) lines.push(`key${i}: value${i}`)
    const doc = lines.join('\n') + '\n'

    const patch = [
      ...Array.from({ length: 5 }, (_, i) => ({ op: 'add', path: [`newkey${i}`], value: `new${i}` })),
      ...Array.from({ length: 5 }, (_, i) => ({ op: 'remove', path: [`key${i}`] })),
      ...Array.from({ length: 5 }, (_, i) => ({ op: 'replace', path: [`key${i + 5}`], value: `replaced${i}` })),
    ]

    const result = applyPatches(doc, patch)
    const parsed = YAML.parse(result)

    // Added keys present
    for (let i = 0; i < 5; i++) assert.equal(parsed[`newkey${i}`], `new${i}`)
    // Removed keys absent
    for (let i = 0; i < 5; i++) assert.equal(parsed[`key${i}`], undefined)
    // Replaced keys updated
    for (let i = 0; i < 5; i++) assert.equal(parsed[`key${i + 5}`], `replaced${i}`)
    // Untouched keys preserved
    for (let i = 10; i < 30; i++) assert.equal(String(parsed[`key${i}`]), `value${i}`)
  })
})
