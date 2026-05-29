import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Mocha from 'mocha'
import { build } from 'vite'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const entry = path.join(packageRoot, 'test/embedded.integration.entry.js')
const outDir = path.join(packageRoot, '.embedded-integration')
const bundleName = 'embedded.integration.bundle.mjs'
const bundlePath = path.join(outDir, bundleName)

await fs.rm(outDir, { recursive: true, force: true })

try {
  await build({
    configFile: false,
    root: packageRoot,
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
    },
    ssr: {
      noExternal: true
    }
  })

  const mocha = new Mocha({ reporter: 'spec' })
  mocha.addFile(bundlePath)

  const failures = await new Promise(resolve => mocha.run(resolve))
  if (failures) process.exitCode = 1
}
finally {
  await fs.rm(outDir, { recursive: true, force: true })
}
