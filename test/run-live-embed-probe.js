import process from 'node:process'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const configFile = fileURLToPath(new URL('./vite.config.js', import.meta.url))
const targetId = process.env.TARGET_ID || 'a5474480-0b4b-11f1-b7ee-5d6256466e2d'
const timeoutMs = Number.parseInt(process.env.PROBE_TIMEOUT || '45000', 10)
const fakeAuth = process.env.FAKE_AUTH === '1'
const outputPath = process.env.PROBE_OUTPUT
const probeHost = process.env.PROBE_HOST
const libPath = [
  '/tmp/codex-pw-libs/usr/lib/x86_64-linux-gnu',
  '/tmp/codex-pw-libs/lib/x86_64-linux-gnu',
  process.env.LD_LIBRARY_PATH
].filter(Boolean).join(':')

process.env.LD_LIBRARY_PATH = libPath
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = 'true'

const { firefox } = await import('playwright')
const server = await createServer({ configFile })
let browser

const consoleMessages = []
const pageErrors = []
const requestFailures = []
const httpErrors = []
const screenshotPath = process.env.PROBE_SCREENSHOT || '/tmp/live-embed-probe.png'

try {
  await server.listen()
  const baseUrl = server.resolvedUrls?.local?.find(url => url.startsWith('https://localhost'))
    || 'https://localhost:5112/'

  browser = await firefox.launch({ headless: process.env.HEADED !== '1' })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()

  if (probeHost) {
    await page.route(`https://${probeHost}/**`, async route => {
      const requestUrl = new URL(route.request().url())
      const localPrefixes = [
        '/live-embed',
        '/@vite',
        '/@fs',
        '/@id',
        '/node_modules',
        '/__vite'
      ]

      if (!localPrefixes.some(prefix => requestUrl.pathname.startsWith(prefix))) {
        await route.continue()
        return
      }

      const localUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, baseUrl)
      const response = await route.fetch({ url: localUrl.href })
      await route.fulfill({ response })
    })
  }

  page.on('console', message => {
    consoleMessages.push({
      type: message.type(),
      text: message.text(),
      location: message.location()
    })
  })
  page.on('pageerror', error => pageErrors.push(error.stack || error.message))
  page.on('requestfailed', request => {
    requestFailures.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText
    })
  })
  page.on('response', response => {
    if (response.status() >= 400) {
      httpErrors.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText()
      })
    }
  })

  const url = new URL('/live-embed.html', probeHost ? `https://${probeHost}/` : baseUrl)
  url.searchParams.set('id', targetId)
  url.searchParams.set('timeout', String(timeoutMs))
  if (fakeAuth) url.searchParams.set('fakeAuth', '1')

  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForFunction(() => window.__liveEmbedProbe?.done === true, null, { timeout: timeoutMs + 15000 })

  const result = await page.evaluate(() => ({
    probe: window.__liveEmbedProbe,
    iframe: {
      src: document.getElementById('target-frame')?.src,
      width: document.getElementById('target-frame')?.clientWidth,
      height: document.getElementById('target-frame')?.clientHeight
    }
  }))

  result.frames = page.frames().map(frame => ({
    url: frame.url(),
    name: frame.name()
  }))
  result.frameDocuments = await Promise.all(
    page.frames().map(async frame => {
      try {
        return {
          url: frame.url(),
          name: frame.name(),
          document: await frame.evaluate(() => ({
            readyState: document.readyState,
            title: document.title,
            bodyText: document.body?.innerText?.slice(0, 2000) || '',
            bodyChildCount: document.body?.children?.length || 0,
            htmlStart: document.documentElement?.outerHTML?.slice(0, 2000) || ''
          }))
        }
      }
      catch (error) {
        return {
          url: frame.url(),
          name: frame.name(),
          error: error?.message || String(error)
        }
      }
    })
  )
  await page.screenshot({ path: screenshotPath, fullPage: true })
  result.screenshotPath = screenshotPath
  result.consoleMessages = consoleMessages
  result.pageErrors = pageErrors
  result.requestFailures = requestFailures
  result.httpErrors = httpErrors

  if (outputPath) {
    await writeFile(outputPath, JSON.stringify(result, null, 2))
    const eventCounts = result.probe.events.reduce((counts, event) => {
      counts[event.type] = (counts[event.type] || 0) + 1
      return counts
    }, {})
    const requestEvents = result.probe.events
      .filter(event => event.type === 'post-message')
      .map(event => ({
        type: event.data.type,
        query: event.data.query,
        scope: event.data.scope,
        domain: event.data.domain
      }))
    const responseErrors = result.probe.events
      .filter(event => event.type === 'post-down' && event.data.error)
      .map(event => ({
        requestId: event.data.requestId,
        error: event.data.error
      }))
    console.log(JSON.stringify({
      outputPath,
      screenshotPath,
      opened: result.probe.opened,
      iframeSrc: result.iframe.src,
      eventCounts,
      requestEvents: requestEvents.slice(0, 80),
      responseErrors: responseErrors.slice(0, 80),
      pageErrors: pageErrors.slice(0, 20),
      httpErrors,
      requestFailures
    }, null, 2))
  }
  else {
    console.log(JSON.stringify(result, null, 2))
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
