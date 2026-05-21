import { defineConfig } from 'vite'

const testRoot = __dirname.replace(/\\/g, '/')

function embeddedGlobalBindings() {
  const prefix = [
    'const Agent = new Proxy({}, {',
    '  get(_, prop) {',
    '    const value = globalThis.Agent?.[prop]',
    '    return typeof value === "function" ? value.bind(globalThis.Agent) : value',
    '  }',
    '});',
    'const Agent2 = new Proxy({}, {',
    '  get(_, prop) {',
    '    const value = globalThis.Agent2?.[prop]',
    '    return typeof value === "function" ? value.bind(globalThis.Agent2) : value',
    '  }',
    '});',
    'const Agent3 = new Proxy({}, {',
    '  get(_, prop) {',
    '    const value = globalThis.Agent3?.[prop]',
    '    return typeof value === "function" ? value.bind(globalThis.Agent3) : value',
    '  }',
    '});',
    'const expect = (...args) => globalThis.expect(...args);',
    'const pause = (...args) => globalThis.pause(...args);',
    'const uuid = (...args) => globalThis.uuid(...args);',
    ''
  ].join('\n')

  return {
    name: 'embedded-global-bindings',
    transform(code, id) {
      const normalized = id.replace(/\\/g, '/')
      if (
        normalized.startsWith(`${testRoot}/tests/`)
        || normalized.startsWith(`${testRoot}/utils/`)
      ) {
        return `${prefix}${code}`
      }
      return null
    }
  }
}

export default defineConfig({
  build: {
    target: 'esnext'
  },
  plugins: [embeddedGlobalBindings()],
  resolve: {
    alias: [
      {
        find: '@knowlearning/agents/vue.js',
        replacement: `${__dirname}/embedded-agents-vue.js`
      },
      {
        find: '@knowlearning/agents/browser.js',
        replacement: `${__dirname}/../packages/agents/node.js`
      },
      {
        find: '@knowlearning/agents/browser/initialize.js',
        replacement: `${__dirname}/../packages/agents/agents/node/initialize.js`
      },
      {
        find: '@knowlearning/patch-proxy',
        replacement: `${__dirname}/node_modules/@knowlearning/patch-proxy/index.js`
      },
      {
        find: 'fast-json-patch',
        replacement: `${__dirname}/node_modules/fast-json-patch`
      },
      {
        find: 'vue',
        replacement: `${__dirname}/embedded-vue-runtime.js`
      }
    ]
  }
})
