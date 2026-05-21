import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { preflightApiHosts } from './api-preflight.js'

const configFile = fileURLToPath(new URL('./vite.config.js', import.meta.url))
const crossServer = process.env.CROSS_SERVER === '1'
const apiHost = process.env.API_HOST || 'socket-io.localhost:8765'
const serverCount = process.env.SERVER_COUNT || '3'
const apiPort = process.env.API_PORT || '8765'
const aliasCount = process.env.ALIAS_COUNT
const apiHosts = process.env.API_HOSTS
const testTimeout = Number.parseInt(process.env.TEST_TIMEOUT || (crossServer ? '120000' : '180000'), 10)
const headed = process.env.HEADED === '1'

try {
  await preflightApiHosts({ label: crossServer ? 'Cross-server API preflight' : 'Browser API preflight' })
}
catch (error) {
  console.error(error.message)
  process.exit(1)
}

let chromium
try {
  ;({ chromium } = await import('playwright'))
}
catch (error) {
  console.error('Missing Playwright dependency. Install test dependencies before running this script.')
  process.exit(1)
}

const server = await createServer({ configFile })
let browser

try {
  await server.listen()
  const baseUrl = server.resolvedUrls?.local?.find(url => url.startsWith('https://localhost'))
    || 'https://localhost:5112/'

  browser = await chromium.launch({ headless: !headed })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  await context.addInitScript(host => {
    localStorage.setItem('API_HOST', host)
  }, apiHost)

  const page = await context.newPage()
  const pageErrors = []

  page.on('pageerror', error => {
    pageErrors.push(error.stack || error.message)
  })

  if (process.env.BROWSER_LOGS === '1') {
    page.on('console', message => {
      console.log(`[browser:${message.type()}] ${message.text()}`)
    })
  }

  const url = new URL(baseUrl)
  if (crossServer) {
    url.searchParams.set('crossServer', '1')
    url.searchParams.set('serverCount', serverCount)
    url.searchParams.set('apiPort', apiPort)
    if (aliasCount) url.searchParams.set('aliasCount', aliasCount)
    if (apiHosts) url.searchParams.set('apiHosts', apiHosts)
  }

  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForFunction(() => window.__mochaDone === true, null, { timeout: testTimeout })

  const result = await page.evaluate(() => ({
    attempts: window.__crossServerAttempts || [],
    failures: window.__mochaFailures || [],
    stats: window.__mochaStats || {}
  }))

  if (crossServer && result.attempts.length) {
    console.log('Cross-server allocation:')
    result.attempts.forEach(({ apiHost, server, error }) => {
      console.log(`  ${apiHost} -> ${server || error}`)
    })
  }

  if (pageErrors.length) {
    console.error('Browser page errors:')
    pageErrors.forEach(error => console.error(error))
  }

  const failures = result.stats.failures || result.failures.length || pageErrors.length
  if (failures) {
    console.error(`${failures} browser test failure(s)`)
    result.failures.forEach(failure => {
      console.error(`\n${failure.fullTitle}`)
      console.error(failure.stack || failure.message)
    })
    process.exitCode = 1
  }
  else {
    console.log(`${result.stats.passes || 0}/${result.stats.tests || 0} browser tests passed`)
  }
}
catch (error) {
  console.error(error.stack || error.message)
  process.exitCode = 1
}
finally {
  await browser?.close()
  await server.close()
}
