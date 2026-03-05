/**
 * Multi-edit performance tests.
 *
 * These are designed to stress the per-op re-parse cost: large documents,
 * high op counts, varied op types, and edits that produce large position
 * shifts so that any incremental-parse benefit is measurable.
 *
 * Run:           node --test --test-name-pattern "multi-edit performance"
 * Update baseline: PERF_UPDATE=1 node --test --test-name-pattern "multi-edit performance"
 */
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
  const tree = ensureSyntaxTree(state, yamlText.length, Infinity)
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
  fn() // warm-up
  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  return (performance.now() - start) / iterations
}

// ---------------------------------------------------------------------------
// Document fixtures
// ---------------------------------------------------------------------------

/** Flat map with `n` keys, each value ~10 chars */
function flatMap(n) {
  const lines = []
  for (let i = 0; i < n; i++) lines.push(`key${i}: value${String(i).padStart(4, '0')}`)
  return lines.join('\n') + '\n'
}

/** Nested config-style document: sections each containing several scalar keys */
function configDoc(sections, keysPerSection) {
  const lines = []
  for (let s = 0; s < sections; s++) {
    lines.push(`section${s}:`)
    for (let k = 0; k < keysPerSection; k++) {
      lines.push(`  setting${k}: defaultvalue${k}`)
    }
    lines.push(`  enabled: true`)
    lines.push(`  priority: ${s}`)
  }
  return lines.join('\n') + '\n'
}

/** Mixed document: flat scalars, a long sequence, and a nested map with block scalars */
function mixedDoc() {
  const lines = [
    'version: 1',
    'name: my-project',
    'description: a sample project for testing',
    'author: tester',
    'license: MIT',
    '',
    'dependencies:',
  ]
  for (let i = 0; i < 60; i++) lines.push(`  - package${i}@1.0.${i}`)
  lines.push('')
  lines.push('config:')
  for (let i = 0; i < 40; i++) lines.push(`  option${i}: value${i}`)
  lines.push('')
  lines.push('scripts:')
  lines.push('  build: |')
  lines.push('    echo building')
  lines.push('    npm run compile')
  lines.push('    npm run bundle')
  lines.push('  test: |')
  lines.push('    echo testing')
  lines.push('    npm run unit')
  lines.push('    npm run e2e')
  for (let i = 0; i < 30; i++) lines.push(`  script${i}: node scripts/script${i}.js`)
  return lines.join('\n') + '\n'
}

/** Document with many block scalars — large text displacement per op */
function blockScalarDoc(n) {
  const lines = []
  for (let i = 0; i < n; i++) {
    lines.push(`entry${i}:`)
    lines.push(`  title: Title ${i}`)
    lines.push(`  body: |`)
    lines.push(`    This is paragraph one of entry ${i}.`)
    lines.push(`    It spans multiple lines for realistic size.`)
    lines.push(`    And ends here.`)
    lines.push(`  tags:`)
    lines.push(`    - alpha`)
    lines.push(`    - beta`)
  }
  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('multi-edit performance', () => {

  // --- Flat map, many replaces ---

  test('50 replaces – 500-key flat map', () => {
    const doc = flatMap(500)
    // Spread ops evenly so they touch beginning, middle, and end
    const patch = Array.from({ length: 50 }, (_, i) => ({
      op: 'replace',
      path: [`key${i * 10}`],
      value: `replaced-value-${i}`,
    }))
    const avgMs = bench(() => applyPatches(doc, patch), 10)
    checkOrRecord('50 replaces – 500-key flat map', avgMs)
  })

  test('50 replaces – 500-key flat map, tail only', () => {
    const doc = flatMap(500)
    // All ops at the tail — maximum unchanged prefix for parser reuse
    const patch = Array.from({ length: 50 }, (_, i) => ({
      op: 'replace',
      path: [`key${450 + i}`],
      value: `replaced-value-${i}`,
    }))
    const avgMs = bench(() => applyPatches(doc, patch), 10)
    checkOrRecord('50 replaces – 500-key flat map, tail only', avgMs)
  })

  test('50 replaces – 500-key flat map, head only', () => {
    const doc = flatMap(500)
    // All ops at the head — maximum position shift for subsequent ops
    const patch = Array.from({ length: 50 }, (_, i) => ({
      op: 'replace',
      path: [`key${i}`],
      value: `replaced-value-${i}`,
    }))
    const avgMs = bench(() => applyPatches(doc, patch), 10)
    checkOrRecord('50 replaces – 500-key flat map, head only', avgMs)
  })

  // --- Flat map, mixed op types ---

  test('60 mixed ops (add+remove+replace) – 400-key flat map', () => {
    const doc = flatMap(400)
    const patch = [
      ...Array.from({ length: 20 }, (_, i) => ({ op: 'add', path: [`newkey${i}`], value: `added${i}` })),
      ...Array.from({ length: 20 }, (_, i) => ({ op: 'remove', path: [`key${i * 5}`] })),
      ...Array.from({ length: 20 }, (_, i) => ({ op: 'replace', path: [`key${i * 5 + 2}`], value: `replaced${i}` })),
    ]
    const avgMs = bench(() => applyPatches(doc, patch), 10)
    checkOrRecord('60 mixed ops (add+remove+replace) – 400-key flat map', avgMs)
  })

  // --- Config-style nested document ---

  test('40 replaces – nested config (20 sections × 10 settings)', () => {
    const doc = configDoc(20, 10)
    // Replace one setting per section
    const patch = Array.from({ length: 20 }, (_, s) => ({
      op: 'replace',
      path: [`section${s}`, 'enabled'],
      value: false,
    })).concat(Array.from({ length: 20 }, (_, s) => ({
      op: 'replace',
      path: [`section${s}`, 'priority'],
      value: s * 10,
    })))
    const avgMs = bench(() => applyPatches(doc, patch), 10)
    checkOrRecord('40 replaces – nested config (20 sections × 10 settings)', avgMs)
  })

  test('60 mixed ops – nested config (30 sections × 8 settings)', () => {
    const doc = configDoc(30, 8)
    const patch = [
      // Toggle enabled in first 20 sections
      ...Array.from({ length: 20 }, (_, s) => ({ op: 'replace', path: [`section${s}`, 'enabled'], value: false })),
      // Replace a scalar in every third section
      ...Array.from({ length: 10 }, (_, i) => ({ op: 'replace', path: [`section${i * 3}`, 'setting0'], value: `overridden${i}` })),
      // Add a new key to every fourth section
      ...Array.from({ length: 7 }, (_, i) => ({ op: 'add', path: [`section${i * 4}`, 'extra'], value: `extra${i}` })),
      // Update priorities in last 10 sections
      ...Array.from({ length: 10 }, (_, i) => ({ op: 'replace', path: [`section${20 + i}`, 'priority'], value: 999 })),
      // Remove setting5 from first 13 sections
      ...Array.from({ length: 13 }, (_, s) => ({ op: 'remove', path: [`section${s}`, 'setting5'] })),
    ]
    const avgMs = bench(() => applyPatches(doc, patch), 10)
    checkOrRecord('60 mixed ops – nested config (30 sections × 8 settings)', avgMs)
  })

  // --- Mixed-structure document ---

  test('50 mixed ops – complex mixed document (scalars, sequence, nested map)', () => {
    const doc = mixedDoc()
    const patch = [
      { op: 'replace', path: ['version'], value: 2 },
      { op: 'replace', path: ['name'], value: 'renamed-project' },
      { op: 'replace', path: ['license'], value: 'Apache-2.0' },
      // Replace items in the dependencies sequence
      ...Array.from({ length: 15 }, (_, i) => ({ op: 'replace', path: ['dependencies', i * 4], value: `package${i * 4}@2.0.0` })),
      // Replace config options
      ...Array.from({ length: 20 }, (_, i) => ({ op: 'replace', path: ['config', `option${i}`], value: `custom${i}` })),
      // Add new config options
      ...Array.from({ length: 7 }, (_, i) => ({ op: 'add', path: ['config', `newopt${i}`], value: i })),
      // Remove some scripts
      ...Array.from({ length: 5 }, (_, i) => ({ op: 'remove', path: ['scripts', `script${i}`] })),
    ]
    const avgMs = bench(() => applyPatches(doc, patch), 10)
    checkOrRecord('50 mixed ops – complex mixed document (scalars, sequence, nested map)', avgMs)
  })

  // --- Block scalar document (large per-op text displacement) ---

  test('20 block scalar replacements – 40-entry doc', () => {
    const doc = blockScalarDoc(40)
    // Replace every other entry's body with a different multiline value
    const longBody = 'Updated line one.\nUpdated line two.\nUpdated line three.\nUpdated line four.\n'
    const patch = Array.from({ length: 20 }, (_, i) => ({
      op: 'replace',
      path: [`entry${i * 2}`, 'body'],
      value: longBody,
    }))
    const avgMs = bench(() => applyPatches(doc, patch), 10)
    checkOrRecord('20 block scalar replacements – 40-entry doc', avgMs)
  })

  test('30 mixed ops – block scalar doc with tag/title/body edits', () => {
    const doc = blockScalarDoc(30)
    const patch = [
      // Replace titles throughout
      ...Array.from({ length: 15 }, (_, i) => ({ op: 'replace', path: [`entry${i * 2}`, 'title'], value: `Updated Title ${i}` })),
      // Replace bodies in first 10 entries — large text shifts
      ...Array.from({ length: 10 }, (_, i) => ({
        op: 'replace',
        path: [`entry${i}`, 'body'],
        value: `New content line 1.\nNew content line 2.\nNew content line 3.\n`,
      })),
      // Add a tag to last 5 entries
      ...Array.from({ length: 5 }, (_, i) => ({ op: 'add', path: [`entry${25 + i}`, 'tags', 99], value: 'gamma' })),
    ]
    const avgMs = bench(() => applyPatches(doc, patch), 10)
    checkOrRecord('30 mixed ops – block scalar doc with tag/title/body edits', avgMs)
  })

  // --- Sequence-heavy ---

  test('50 appends to large sequence (200-item base)', () => {
    const lines = ['items:']
    for (let i = 0; i < 200; i++) lines.push(`  - item${i}`)
    const doc = lines.join('\n') + '\n'
    const patch = Array.from({ length: 50 }, (_, i) => ({
      op: 'add',
      path: ['items', 999],
      value: `appended${i}`,
    }))
    const avgMs = bench(() => applyPatches(doc, patch), 10)
    checkOrRecord('50 appends to large sequence (200-item base)', avgMs)
  })

  test('40 replace+remove on large sequence (150-item)', () => {
    const lines = ['items:']
    for (let i = 0; i < 150; i++) lines.push(`  - item${i}`)
    const doc = lines.join('\n') + '\n'
    const patch = [
      ...Array.from({ length: 20 }, (_, i) => ({ op: 'replace', path: ['items', i * 7], value: `replaced${i}` })),
      ...Array.from({ length: 20 }, (_, i) => ({ op: 'remove', path: ['items', i * 3 + 1] })),
    ]
    const avgMs = bench(() => applyPatches(doc, patch), 10)
    checkOrRecord('40 replace+remove on large sequence (150-item)', avgMs)
  })

  // --- Value-size extremes ---

  test('30 short→long value replacements – 300-key flat map', () => {
    // Short values replaced by long ones: maximum rightward position shift for subsequent ops
    const doc = flatMap(300)
    const longVal = 'x'.repeat(120)
    const patch = Array.from({ length: 30 }, (_, i) => ({
      op: 'replace',
      path: [`key${i * 10}`],
      value: longVal,
    }))
    const avgMs = bench(() => applyPatches(doc, patch), 10)
    checkOrRecord('30 short→long value replacements – 300-key flat map', avgMs)
  })

  test('30 long→short value replacements – 300-key flat map', () => {
    // Build doc with long values, replace with short: maximum leftward position shift
    const lines = []
    for (let i = 0; i < 300; i++) lines.push(`key${i}: ${'x'.repeat(80)}`)
    const doc = lines.join('\n') + '\n'
    const patch = Array.from({ length: 30 }, (_, i) => ({
      op: 'replace',
      path: [`key${i * 10}`],
      value: 'v',
    }))
    const avgMs = bench(() => applyPatches(doc, patch), 10)
    checkOrRecord('30 long→short value replacements – 300-key flat map', avgMs)
  })

})
