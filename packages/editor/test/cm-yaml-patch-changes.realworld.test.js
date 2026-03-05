// test/cm-yaml-patch-changes.realworld.test.js
//
// Comprehensive “real-world state update” tests for cmYAMLPatchChanges.
// Focus: patches you’ll see in apps (settings/state files, k8s/helm, CI configs),
// and adversarial-but-real formatting (comments, anchors, flow+block mixes).
//
// These tests assume patch semantics like JSON Patch-ish ops:
//   { op: 'add'|'remove'|'replace', path: [...], value?: any }
//
// NOTE: Some tests may fail depending on how strictly you want to preserve formatting.
// They are written to encode desirable behavior for an editor that tries to be stable and minimal.

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

describe('real-world: app/editor state files', () => {
  test('toggle feature flag, preserve inline comments and surrounding formatting', () => {
    assert.equal(
      applyPatches(`\
# app state
features:
  darkMode: false # user toggle
  beta: true
`, [{ op: 'replace', path: ['features', 'darkMode'], value: true }]),
      `\
# app state
features:
  darkMode: true # user toggle
  beta: true
`
    )
  })

  test('add nested preference into existing map at end', () => {
    assert.equal(
      applyPatches(`\
prefs:
  theme: system
  fontSize: 14
`, [{ op: 'add', path: ['prefs', 'lineHeight'], value: 1.4 }]),
      `\
prefs:
  theme: system
  fontSize: 14
  lineHeight: 1.4
`
    )
  })

  test('remove preference while keeping blank-line grouping', () => {
    assert.equal(
      applyPatches(`\
prefs:
  theme: system

  telemetry: true
  fontSize: 14
`, [{ op: 'remove', path: ['prefs', 'telemetry'] }]),
      `\
prefs:
  theme: system

  fontSize: 14
`
    )
  })

  test('replace scalar with object (state expanded to structured form)', () => {
    assert.equal(
      applyPatches(`\
session: abc123
`, [{ op: 'replace', path: ['session'], value: { id: 'abc123', expiresAt: '2026-03-05T12:00:00Z' } }]),
      `\
session:
  id: abc123
  expiresAt: 2026-03-05T12:00:00Z
`
    )
  })

  test('replace object with scalar (state collapsed)', () => {
    assert.equal(
      applyPatches(`\
session:
  id: abc123
  expiresAt: 2026-03-05T12:00:00Z
`, [{ op: 'replace', path: ['session'], value: 'abc123' }]),
      `\
session: abc123
`
    )
  })

  test('append to list of recent files', () => {
    assert.equal(
      applyPatches(`\
recent:
  - /a.txt
  - /b.txt
`, [{ op: 'add', path: ['recent', 99], value: '/c.txt' }]),
      `\
recent:
  - /a.txt
  - /b.txt
  - /c.txt
`
    )
  })

  test('remove middle item from list of recent files', () => {
    assert.equal(
      applyPatches(`\
recent:
  - /a.txt
  - /b.txt
  - /c.txt
`, [{ op: 'remove', path: ['recent', 1] }]),
      `\
recent:
  - /a.txt
  - /c.txt
`
    )
  })
})

describe('real-world: GitHub Actions style config', () => {
  test('replace env var used by build', () => {
    assert.equal(
      applyPatches(`\
name: CI
on: [push]
env:
  NODE_ENV: production
  CACHE: "1"
jobs:
  build:
    runs-on: ubuntu-latest
`, [{ op: 'replace', path: ['env', 'CACHE'], value: '0' }]),
      `\
name: CI
on: [push]
env:
  NODE_ENV: production
  CACHE: "0"
jobs:
  build:
    runs-on: ubuntu-latest
`
    )
  })

  test('add new job key in jobs map', () => {
    assert.equal(
      applyPatches(`\
jobs:
  build:
    runs-on: ubuntu-latest
`, [{ op: 'add', path: ['jobs', 'lint'], value: { 'runs-on': 'ubuntu-latest', steps: [{ run: 'npm run lint' }] } }]),
      `\
jobs:
  build:
    runs-on: ubuntu-latest
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint
`
    )
  })

  test('add env var when jobs section ends with comment-only lines', () => {
    assert.equal(
      applyPatches(`\
env:
  A: 1
# trailing comment
`, [{ op: 'add', path: ['env', 'B'], value: 2 }]),
      `\
env:
  A: 1
# trailing comment
  B: 2
`
    )
  })
})

describe('real-world: Kubernetes manifest-ish structures', () => {
  test('update image tag inside containers list', () => {
    assert.equal(
      applyPatches(`\
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  template:
    spec:
      containers:
        - name: app
          image: ghcr.io/acme/app:1.0.0
        - name: sidecar
          image: ghcr.io/acme/sidecar:2.3.4
`, [{ op: 'replace', path: ['spec', 'template', 'spec', 'containers', 0, 'image'], value: 'ghcr.io/acme/app:1.0.1' }]),
      `\
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  template:
    spec:
      containers:
        - name: app
          image: ghcr.io/acme/app:1.0.1
        - name: sidecar
          image: ghcr.io/acme/sidecar:2.3.4
`
    )
  })

  test('add environment variable to container env list (append)', () => {
    assert.equal(
      applyPatches(`\
spec:
  template:
    spec:
      containers:
        - name: app
          env:
            - name: NODE_ENV
              value: production
`, [{
        op: 'add',
        path: ['spec', 'template', 'spec', 'containers', 0, 'env', 99],
        value: { name: 'LOG_LEVEL', value: 'info' }
      }]),
      `\
spec:
  template:
    spec:
      containers:
        - name: app
          env:
            - name: NODE_ENV
              value: production
            - name: LOG_LEVEL
              value: info
`
    )
  })

  test('remove env var object from container env list (middle)', () => {
    assert.equal(
      applyPatches(`\
spec:
  template:
    spec:
      containers:
        - name: app
          env:
            - name: A
              value: 1
            - name: B
              value: 2
            - name: C
              value: 3
`, [{ op: 'remove', path: ['spec', 'template', 'spec', 'containers', 0, 'env', 1] }]),
      `\
spec:
  template:
    spec:
      containers:
        - name: app
          env:
            - name: A
              value: 1
            - name: C
              value: 3
`
    )
  })

  test('add annotations under metadata when metadata contains leading comments', () => {
    assert.equal(
      applyPatches(`\
metadata:
  # keep
  name: app
`, [{ op: 'add', path: ['metadata', 'annotations'], value: { 'example.com/x': '1' } }]),
      `\
metadata:
  # keep
  name: app
  annotations:
    "example.com/x": "1"
`
    )
  })
})

describe('real-world: anchors and shared defaults (Helm-like)', () => {
  test('update anchored default and keep anchor token', () => {
    assert.equal(
      applyPatches(`\
defaults: &def
  replicas: 2
serviceA:
  <<: *def
serviceB:
  <<: *def
`, [{ op: 'replace', path: ['defaults', 'replicas'], value: 3 }]),
      `\
defaults: &def
  replicas: 3
serviceA:
  <<: *def
serviceB:
  <<: *def
`
    )
  })

  test('add key to anchored defaults map', () => {
    assert.equal(
      applyPatches(`\
defaults: &def
  replicas: 2
serviceA:
  <<: *def
`, [{ op: 'add', path: ['defaults', 'resources'], value: { limits: { cpu: '100m', memory: '128Mi' } } }]),
      `\
defaults: &def
  replicas: 2
  resources:
    limits:
      cpu: 100m
      memory: 128Mi
serviceA:
  <<: *def
`
    )
  })
})

describe('real-world: flow style configs (common in compact state)', () => {
  test('replace value in flow mapping nested in doc', () => {
    assert.equal(
      applyPatches(`\
settings: { theme: light, compact: true }
`, [{ op: 'replace', path: ['settings', 'theme'], value: 'dark' }]),
      `\
settings: { theme: dark, compact: true }
`
    )
  })

  test('remove key in flow mapping nested in doc', () => {
    assert.equal(
      applyPatches(`\
settings: { theme: light, compact: true }
`, [{ op: 'remove', path: ['settings', 'compact'] }]),
      `\
settings: { theme: light }
`
    )
  })

  test('add key in flow mapping nested in doc', () => {
    assert.equal(
      applyPatches(`\
settings: { theme: light }
`, [{ op: 'add', path: ['settings', 'compact'], value: true }]),
      `\
settings: { theme: light, compact: true }
`
    )
  })

  test('flow sequence: append item (canonical spacing)', () => {
    assert.equal(
      applyPatches(`\
recent: [a, b]
`, [{ op: 'add', path: ['recent', 99], value: 'c' }]),
      `\
recent: [a, b, c]
`
    )
  })

  test('flow sequence: add to empty list (canonical spacing)', () => {
    assert.equal(
      applyPatches(`\
recent: []
`, [{ op: 'add', path: ['recent', 0], value: 'x' }]),
      `\
recent: [x]
`
    )
  })

  test('flow sequence: remove middle item', () => {
    assert.equal(
      applyPatches(`\
recent: [a, b, c]
`, [{ op: 'remove', path: ['recent', 1] }]),
      `\
recent: [a, c]
`
    )
  })
})

describe('real-world: comments + indentation gotchas', () => {
  test('replace in pattern "a: # comment\\n  1" should keep comment', () => {
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

  test('replace scalar with map where original has inline comment', () => {
    assert.equal(
      applyPatches(`\
a: 1 # keep
`, [{ op: 'replace', path: ['a'], value: { b: 2 } }]),
      // “Ideal”: keep comment on the key line.
      `\
a: # keep
  b: 2
`
    )
  })

  test('add key to map that ends with blanks and comment-only lines', () => {
    assert.equal(
      applyPatches(`\
a: 1

# section end
`, [{ op: 'add', path: ['b'], value: 2 }]),
      `\
a: 1

# section end
b: 2
`
    )
  })
})

describe('real-world: multi-operation state transaction', () => {
  test('multi-op: update version, remove deprecated key, add new key (same parent)', () => {
    assert.equal(
      applyPatches(`\
stateVersion: 1
deprecated: true
flags:
  a: false
`, [
        { op: 'replace', path: ['stateVersion'], value: 2 },
        { op: 'remove', path: ['deprecated'] },
        { op: 'add', path: ['flags', 'b'], value: true }
      ]),
      `\
stateVersion: 2
flags:
  a: false
  b: true
`
    )
  })

  test('multi-op: list surgery with stable positions (remove earlier, add later)', () => {
    assert.equal(
      applyPatches(`\
items:
  - a
  - b
  - c
`, [
        { op: 'remove', path: ['items', 0] },
        { op: 'replace', path: ['items', 1], value: 'cc' },
        { op: 'add', path: ['items', 99], value: 'z' }
      ]),
      `\
items:
  - b
  - cc
  - z
`
    )
  })
})

describe('real-world: degenerate but common shapes', () => {
  test('add to empty mapping document', () => {
    assert.equal(
      applyPatches(`\
`, [{ op: 'add', path: ['a'], value: 1 }]),
      // If your parser yields no structural root, this may no-op; this is an aspirational behavior.
      `\
a: 1
`
    )
  })

  test('add first item to empty sequence field (k8s-ish)', () => {
    assert.equal(
      applyPatches(`\
tolerations:
`, [{ op: 'add', path: ['tolerations', 0], value: { key: 'dedicated', operator: 'Equal', value: 'gpu', effect: 'NoSchedule' } }]),
      `\
tolerations:
  - key: dedicated
    operator: Equal
    value: gpu
    effect: NoSchedule
`
    )
  })

  test('replace null with object', () => {
    assert.equal(
      applyPatches(`\
cfg: null
`, [{ op: 'replace', path: ['cfg'], value: { enabled: true } }]),
      `\
cfg:
  enabled: true
`
    )
  })
})