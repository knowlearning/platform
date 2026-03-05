// test/cm-yaml-patch-changes.realworld.2.test.js

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

function assertOneOf(actual, expectedOptions) {
  for (const exp of expectedOptions) {
    if (actual === exp) return
  }
  assert.fail(
    `Expected value to equal one of:\n\n${expectedOptions.map(s => JSON.stringify(s)).join('\n')}\n\nActual:\n\n${JSON.stringify(actual)}`
  )
}

describe('real-world 2: JSON Patch semantics (sequential ops)', () => {
  test('sequence surgery: remove index 0, replace new index 1, append', () => {
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

  test('sequence surgery: insert at 0 then replace shifted element', () => {
    assert.equal(
      applyPatches(`\
items:
  - a
  - b
`, [
        { op: 'add', path: ['items', 0], value: 'x' },
        { op: 'replace', path: ['items', 2], value: 'bb' }
      ]),
      `\
items:
  - x
  - a
  - bb
`
    )
  })

  test('map then list: add new list, then append into it (flow formatting is acceptable)', () => {
    // Your implementation will stringify [] and later appends as flow style in practice: [x, y]
    assert.equal(
      applyPatches(`\
a: 1
`, [
        { op: 'add', path: ['list'], value: [] },
        { op: 'add', path: ['list', 0], value: 'x' },
        { op: 'add', path: ['list', 1], value: 'y' }
      ]),
      `\
a: 1
list:
  [x, y]
`
    )
  })

  test('remove then re-add same key (should be independent sequentially)', () => {
    assert.equal(
      applyPatches(`\
a: 1
b: 2
`, [
        { op: 'remove', path: ['b'] },
        { op: 'add', path: ['b'], value: 9 }
      ]),
      `\
a: 1
b: 9
`
    )
  })
})

describe('real-world 2: Kubernetes deployments and services', () => {
  test('add label and annotation, replace image tag, remove sidecar', () => {
    assert.equal(
      applyPatches(`\
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  template:
    metadata:
      labels:
        app: app
    spec:
      containers:
        - name: app
          image: ghcr.io/acme/app:1.0.0
        - name: sidecar
          image: ghcr.io/acme/sidecar:2.3.4
`, [
        { op: 'add', path: ['metadata', 'labels'], value: { team: 'core' } },
        { op: 'add', path: ['metadata', 'annotations'], value: { 'example.com/rev': '42' } },
        { op: 'replace', path: ['spec', 'template', 'spec', 'containers', 0, 'image'], value: 'ghcr.io/acme/app:1.0.1' },
        { op: 'remove', path: ['spec', 'template', 'spec', 'containers', 1] }
      ]),
      `\
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  labels:
    team: core
  annotations:
    "example.com/rev": "42"
spec:
  template:
    metadata:
      labels:
        app: app
    spec:
      containers:
        - name: app
          image: ghcr.io/acme/app:1.0.1
`
    )
  })

  test('add readinessProbe object under a container', () => {
    assert.equal(
      applyPatches(`\
spec:
  template:
    spec:
      containers:
        - name: app
          image: app:1
`, [{
        op: 'add',
        path: ['spec', 'template', 'spec', 'containers', 0, 'readinessProbe'],
        value: { httpGet: { path: '/health', port: 8080 }, initialDelaySeconds: 5 }
      }]),
      `\
spec:
  template:
    spec:
      containers:
        - name: app
          image: app:1
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 5
`
    )
  })

  test('patch env list by index under a container (JSON Patch semantics)', () => {
    assert.equal(
      applyPatches(`\
spec:
  template:
    spec:
      containers:
        - name: app
          env:
            - name: A
              value: "1"
            - name: B
              value: "2"
`, [
        { op: 'remove', path: ['spec', 'template', 'spec', 'containers', 0, 'env', 0] },
        { op: 'replace', path: ['spec', 'template', 'spec', 'containers', 0, 'env', 0, 'value'], value: '22' },
        { op: 'add', path: ['spec', 'template', 'spec', 'containers', 0, 'env', 1], value: { name: 'C', value: '3' } }
      ]),
      `\
spec:
  template:
    spec:
      containers:
        - name: app
          env:
            - name: B
              value: "22"
            - name: C
              value: "3"
`
    )
  })
})

describe('real-world 2: Helm-like anchors, aliases, merges', () => {
  test('replace anchored scalar keeps anchor and alias remains', () => {
    assert.equal(
      applyPatches(`\
a: &x 1
b: *x
`, [{ op: 'replace', path: ['a'], value: 2 }]),
      `\
a: &x 2
b: *x
`
    )
  })

  test('merge + override pattern: add override key after merge', () => {
    assert.equal(
      applyPatches(`\
defaults: &def
  a: 1
  b: 2
svc:
  <<: *def
  b: 9
`, [{ op: 'add', path: ['svc', 'c'], value: 3 }]),
      `\
defaults: &def
  a: 1
  b: 2
svc:
  <<: *def
  b: 9
  c: 3
`
    )
  })

  test('remove merge key from mapping', () => {
    assert.equal(
      applyPatches(`\
svc:
  <<: *def
  a: 1
`, [{ op: 'remove', path: ['svc', '<<'] }]),
      `\
svc:
  a: 1
`
    )
  })

  test('deep anchored mapping: replace nested scalar under an anchored map (quotes not required)', () => {
    const out = applyPatches(`\
defaults: &def
  image:
    repo: ghcr.io/acme/app
    tag: "1.0.0"
use:
  <<: *def
`, [{ op: 'replace', path: ['defaults', 'image', 'tag'], value: '1.0.1' }])

    // yaml stringifier may or may not quote; accept both
    assertOneOf(out, [
      `\
defaults: &def
  image:
    repo: ghcr.io/acme/app
    tag: "1.0.1"
use:
  <<: *def
`,
      `\
defaults: &def
  image:
    repo: ghcr.io/acme/app
    tag: 1.0.1
use:
  <<: *def
`
    ])
  })
})

describe('real-world 2: flow + block mixed configs', () => {
  test('flow mapping inside block: add key and replace value', () => {
    assert.equal(
      applyPatches(`\
cfg:
  flags: { a: true, b: false }
`, [
        { op: 'add', path: ['cfg', 'flags', 'c'], value: true },
        { op: 'replace', path: ['cfg', 'flags', 'b'], value: true }
      ]),
      `\
cfg:
  flags: { a: true, b: true, c: true }
`
    )
  })

  test('flow sequence inside block: remove, then append (canonical spacing)', () => {
    assert.equal(
      applyPatches(`\
cfg:
  recent: [a, b, c]
`, [
        { op: 'remove', path: ['cfg', 'recent', 1] },
        { op: 'add', path: ['cfg', 'recent', 99], value: 'd' }
      ]),
      `\
cfg:
  recent: [a, c, d]
`
    )
  })

  test('replace flow sequence with block sequence', () => {
    assert.equal(
      applyPatches(`\
recent: [a, b]
`, [{ op: 'replace', path: ['recent'], value: ['a', 'b', 'c'] }]),
      `\
recent:
  - a
  - b
  - c
`
    )
  })

  test('replace block sequence with flow sequence (accept either block or flow)', () => {
    const out = applyPatches(`\
recent:
  - a
  - b
`, [{ op: 'replace', path: ['recent'], value: ['a', 'b'] }])

    // Implementation may choose to keep block style or convert to flow depending on stringify.
    assertOneOf(out, [
      `\
recent: [a, b]
`,
      `\
recent:
  - a
  - b
`
    ])
  })
})

describe('real-world 2: comments + directives + multi-doc streams', () => {
  test('directives + comment prelude: replace first real key', () => {
    assert.equal(
      applyPatches(`\
%YAML 1.2
# header
a: 1
`, [{ op: 'replace', path: ['a'], value: 2 }]),
      `\
%YAML 1.2
# header
a: 2
`
    )
  })

  test('multi-doc: current behavior patches first document only (does not touch later docs)', () => {
    // Current implementation uses the first structural descendant in the stream as the root.
    // This test asserts *non-corruption* and stable behavior, rather than doc selection.
    assert.equal(
      applyPatches(`\
---
a: 1
---
b: 2
`, [{ op: 'replace', path: ['b'], value: 9 }]),
      `\
---
a: 1
---
b: 2
`
    )
  })

  test('doc end marker: add before ... stays above marker (stable placement)', () => {
    assert.equal(
      applyPatches(`\
a: 1
...
`, [{ op: 'add', path: ['b'], value: 2 }]),
      `\
a: 1
b: 2
...
`
    )
  })
})

describe('real-world 2: values and quoting', () => {
  test('add keys that require quoting in block maps', () => {
    assert.equal(
      applyPatches(`\
a: 1
`, [
        { op: 'add', path: ['has:colon'], value: 2 },
        { op: 'add', path: ['has space'], value: 3 },
        { op: 'add', path: ['emoji🚀'], value: 4 }
      ]),
      `\
a: 1
"has:colon": 2
"has space": 3
"emoji🚀": 4
`
    )
  })

  test('add nested object containing unsafe keys (should quote in block)', () => {
    assert.equal(
      applyPatches(`\
a: 1
`, [{ op: 'add', path: ['annotations'], value: { 'example.com/x': '1', 'has space': '2' } }]),
      `\
a: 1
annotations:
  "example.com/x": "1"
  "has space": "2"
`
    )
  })

  test('replace scalar with empty string', () => {
    assert.equal(
      applyPatches(`\
a: 1
`, [{ op: 'replace', path: ['a'], value: '' }]),
      `\
a: ""
`
    )
  })

  test('replace scalar with null', () => {
    assert.equal(
      applyPatches(`\
a: 1
`, [{ op: 'replace', path: ['a'], value: null }]),
      `\
a: null
`
    )
  })

  test('replace scalar with date-like string (quotes not required)', () => {
    const out = applyPatches(`\
a: 1
`, [{ op: 'replace', path: ['a'], value: '2026-03-04' }])

    // yaml library may emit quoted or plain scalar; accept both
    assertOneOf(out, [
      `\
a: "2026-03-04"
`,
      `\
a: 2026-03-04
`
    ])
  })
})

describe('real-world 2: structural replacements at depth', () => {
  test('replace mapping with scalar deep in tree', () => {
    assert.equal(
      applyPatches(`\
a:
  b:
    c: 1
`, [{ op: 'replace', path: ['a', 'b'], value: 2 }]),
      `\
a:
  b: 2
`
    )
  })

  test('replace scalar with mapping deep in tree', () => {
    assert.equal(
      applyPatches(`\
a:
  b: 1
`, [{ op: 'replace', path: ['a', 'b'], value: { c: 2 } }]),
      `\
a:
  b:
    c: 2
`
    )
  })

  test('replace scalar with mapping with inline comment on key line', () => {
    assert.equal(
      applyPatches(`\
a:
  b: 1 # keep
`, [{ op: 'replace', path: ['a', 'b'], value: { c: 2 } }]),
      `\
a:
  b: # keep
    c: 2
`
    )
  })
})