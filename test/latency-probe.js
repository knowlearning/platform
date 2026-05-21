import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const packageRoot = fileURLToPath(new URL('.', import.meta.url))
const configFile = path.join(packageRoot, 'vite.embedded.config.js')
const entry = path.join(packageRoot, 'latency-probe.entry.js')
const outDir = path.join(packageRoot, '.latency-probe')
const bundleName = 'latency-probe.bundle.mjs'
const bundlePath = path.join(outDir, bundleName)

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
        output: {
          entryFileNames: bundleName,
          format: 'es'
        }
      }
    }
  })

  await import(bundlePath)
}
finally {
  await fs.rm(outDir, { recursive: true, force: true })
}
