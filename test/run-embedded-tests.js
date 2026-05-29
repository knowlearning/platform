import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Mocha from 'mocha'
import { build } from 'vite'
import { preflightApiHosts } from './api-preflight.js'
import { startGCSLocalhostShim } from './gcs-localhost-shim.js'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const startedAt = process.hrtime.bigint()
const packageRoot = fileURLToPath(new URL('.', import.meta.url))
const configFile = path.join(packageRoot, 'vite.embedded.config.js')
const entry = path.join(packageRoot, 'embedded.entry.js')
const outDir = path.join(packageRoot, '.embedded-tests')
const bundleName = 'embedded.tests.bundle.mjs'
const bundlePath = path.join(outDir, bundleName)
let stopGCSLocalhostShim = async () => {}

function logTotalTime() {
  const elapsedSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000
  console.log(`Embedded test total time: ${elapsedSeconds.toFixed(3)}s`)
}

try {
  await preflightApiHosts({ label: 'Embedded API preflight' })
  stopGCSLocalhostShim = await startGCSLocalhostShim()
}
catch (error) {
  console.error(error.message)
  logTotalTime()
  process.exit(1)
}

await fs.rm(outDir, { recursive: true, force: true })

try {
  await build({
    configFile,
    logLevel: 'warn',
    build: {
      ssr: entry,
      outDir,
      emptyOutDir: true,
      minify: false,
      target: 'node22',
      rollupOptions: {
        external: ['chai', 'mocha'],
        output: {
          entryFileNames: bundleName,
          format: 'es'
        }
      }
    }
  })

  const grep = process.env.TEST_GREP
  const mocha = new Mocha({
    reporter: 'spec',
    ui: 'bdd',
    ...(grep ? { grep } : {})
  })
  mocha.suite.emit('pre-require', globalThis, bundlePath, mocha)
  const { default: registerEmbeddedHarness } = await import(bundlePath)
  await registerEmbeddedHarness()
  mocha.suite.emit('post-require', globalThis, bundlePath, mocha)

  const failures = await new Promise(resolve => mocha.run(resolve))
  if (failures) process.exitCode = 1
}
finally {
  await stopGCSLocalhostShim()
  await fs.rm(outDir, { recursive: true, force: true })
}

logTotalTime()

if (process.env.TEST_NO_FORCE_EXIT !== '1') {
  process.exit(process.exitCode || 0)
}
