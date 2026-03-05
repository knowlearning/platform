import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { yaml } from '@codemirror/lang-yaml'
import cmYAMLPatchChanges from '../cm-yaml-patch-changes.js'

const BASELINE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'perf-baseline.json')
const UPDATE_MODE = process.env.PERF_UPDATE === '1'
const REGRESSION_MULTIPLIER = 2

let baseline = {}
try { baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) } catch {}

function checkOrRecord(label, avgMs) {
  if (UPDATE_MODE) {
    baseline[label] = avgMs
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n')
    console.log(`  [perf:update] ${label}: ${avgMs.toFixed(2)}ms`)
  } else {
    const ref = baseline[label]
    console.log(`  [perf] ${label}: ${avgMs.toFixed(2)}ms${ref ? ` (baseline ${ref.toFixed(2)}ms, limit ${(ref * REGRESSION_MULTIPLIER).toFixed(2)}ms)` : ' (no baseline)'}`)
    if (ref !== undefined) {
      assert.ok(
        avgMs < ref * REGRESSION_MULTIPLIER,
        `REGRESSION: ${label} is ${avgMs.toFixed(2)}ms, > ${REGRESSION_MULTIPLIER}× baseline of ${ref.toFixed(2)}ms`
      )
    }
  }
}

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

function bench(fn, iterations) {
  fn() // warm-up run (excludes JIT + cold-parse overhead)
  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  return (performance.now() - start) / iterations
}

describe('performance', () => {
  test('single replace – small flat map', () => {
    const yamlText = [
      'key0: value0',
      'key1: value1',
      'key2: value2',
      'key3: value3',
      'key4: value4',
    ].join('\n') + '\n'
    const patch = [{ op: 'replace', path: ['key4'], value: 'updated' }]

    const avgMs = bench(() => applyPatches(yamlText, patch), 200)
    checkOrRecord('single replace – small flat map', avgMs)
  })

  test('single replace – large flat map', () => {
    const lines = []
    for (let i = 0; i < 100; i++) lines.push(`key${i}: value${i}`)
    const yamlText = lines.join('\n') + '\n'
    const patch = [{ op: 'replace', path: ['key99'], value: 'updated' }]

    const avgMs = bench(() => applyPatches(yamlText, patch), 100)
    checkOrRecord('single replace – large flat map', avgMs)
  })

  test('sequential replaces – medium map', () => {
    const lines = []
    for (let i = 0; i < 20; i++) lines.push(`key${i}: value${i}`)
    const yamlText = lines.join('\n') + '\n'
    const patch = Array.from({ length: 10 }, (_, i) => ({
      op: 'replace',
      path: [`key${i}`],
      value: `updated${i}`,
    }))

    const avgMs = bench(() => applyPatches(yamlText, patch), 50)
    checkOrRecord('sequential replaces – medium map', avgMs)
  })

  test('deeply nested path traversal', () => {
    const yamlText = [
      'l1:',
      '  l2:',
      '    l3:',
      '      l4:',
      '        l5:',
      '          l6:',
      '            l7:',
      '              l8: leaf',
    ].join('\n') + '\n'
    const patch = [{ op: 'replace', path: ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8'], value: 'changed' }]

    const avgMs = bench(() => applyPatches(yamlText, patch), 100)
    checkOrRecord('deeply nested path traversal', avgMs)
  })

  test('large block sequence – replace middle', () => {
    const lines = ['items:']
    for (let i = 0; i < 100; i++) lines.push(`  - item${i}`)
    const yamlText = lines.join('\n') + '\n'
    const patch = [{ op: 'replace', path: ['items', 50], value: 'updated' }]

    const avgMs = bench(() => applyPatches(yamlText, patch), 100)
    checkOrRecord('large block sequence – replace middle', avgMs)
  })

  test('sequential appends to sequence', () => {
    const lines = ['items:']
    for (let i = 0; i < 10; i++) lines.push(`  - item${i}`)
    const yamlText = lines.join('\n') + '\n'
    const patch = Array.from({ length: 10 }, (_, i) => ({
      op: 'add',
      path: ['items', 99],
      value: `appended${i}`,
    }))

    const avgMs = bench(() => applyPatches(yamlText, patch), 50)
    checkOrRecord('sequential appends to sequence', avgMs)
  })

  test('mixed bulk ops on large document', () => {
    const lines = []
    for (let i = 0; i < 50; i++) lines.push(`key${i}: value${i}`)
    const yamlText = lines.join('\n') + '\n'
    const patch = [
      ...Array.from({ length: 7 }, (_, i) => ({ op: 'add', path: [`newkey${i}`], value: `new${i}` })),
      ...Array.from({ length: 7 }, (_, i) => ({ op: 'remove', path: [`key${i}`] })),
      ...Array.from({ length: 6 }, (_, i) => ({ op: 'replace', path: [`key${i + 7}`], value: `replaced${i}` })),
    ]

    const avgMs = bench(() => applyPatches(yamlText, patch), 20)
    checkOrRecord('mixed bulk ops on large document', avgMs)
  })

  test('block scalar replacement', () => {
    const yamlText = [
      'title: hello',
      'description: short',
      'footer: end',
    ].join('\n') + '\n'
    const multilineValue = 'line one\nline two\nline three\nline four\nline five'
    const patch = [{ op: 'replace', path: ['description'], value: multilineValue }]

    const avgMs = bench(() => applyPatches(yamlText, patch), 200)
    checkOrRecord('block scalar replacement', avgMs)
  })
})
