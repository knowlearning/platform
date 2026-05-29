import process from 'node:process'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const configFile = fileURLToPath(new URL('./vite.config.js', import.meta.url))
const oldClientPath = process.env.OLD_CLIENT_PATH || '/tmp/tmp.hugDh4hvlf/v191/dist/browser.js'
const timeoutMs = Number.parseInt(process.env.PROBE_TIMEOUT || '15000', 10)
const outputPath = process.env.PROBE_OUTPUT || '/tmp/old-local-embed-probe.json'
const screenshotPath = process.env.PROBE_SCREENSHOT || '/tmp/old-local-embed-probe.png'
const parentHost = process.env.PARENT_HOST || 'old-parent.localhost:5112'
const childHost = process.env.CHILD_HOST || 'old-child.localhost:5112'
const apiHost = process.env.API_HOST || 'api-1:8765'
const currentParent = process.env.CURRENT_PARENT === '1'
const libPath = [
  '/tmp/codex-pw-libs/usr/lib/x86_64-linux-gnu',
  '/tmp/codex-pw-libs/lib/x86_64-linux-gnu',
  process.env.LD_LIBRARY_PATH
].filter(Boolean).join(':')

process.env.LD_LIBRARY_PATH = libPath
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = 'true'

const oldClientSource = await readFile(oldClientPath, 'utf8')
const oldParentHtml = await readFile(fileURLToPath(new URL('./old-parent.html', import.meta.url)), 'utf8')
const oldChildHtml = await readFile(fileURLToPath(new URL('./old-child.html', import.meta.url)), 'utf8')
const { firefox } = await import('playwright')
const server = await createServer({ configFile })
let browser

const consoleMessages = []
const pageErrors = []
const requestFailures = []
const httpErrors = []

try {
  await server.listen()
  const baseUrl = server.resolvedUrls?.local?.find(url => url.startsWith('https://localhost'))
    || 'https://localhost:5112/'

  browser = await firefox.launch({ headless: process.env.HEADED !== '1' })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()

  await page.route('**/*', async route => {
    const requestUrl = new URL(route.request().url())
    if (![parentHost, childHost].includes(requestUrl.host)) {
      await route.continue()
      return
    }

    if (requestUrl.pathname === '/old-agents-0.9.191-browser.js') {
      await route.fulfill({
        body: oldClientSource,
        contentType: 'application/javascript'
      })
      return
    }

    if (requestUrl.pathname === '/old-parent.html') {
      await route.fulfill({
        body: oldParentHtml,
        contentType: 'text/html'
      })
      return
    }

    if (requestUrl.pathname === '/old-child.html') {
      await route.fulfill({
        body: oldChildHtml,
        contentType: 'text/html'
      })
      return
    }

    const localUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, baseUrl)
    const response = await route.fetch({ url: localUrl.href })
    await route.fulfill({ response })
  })

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

  const url = new URL(`https://${parentHost}/${currentParent ? 'current-parent-old-child.html' : 'old-parent.html'}`)
  url.searchParams.set('timeout', String(timeoutMs))
  url.searchParams.set('apiHost', apiHost)
  const childUrl = new URL(`https://${childHost}/old-child.html`)
  childUrl.searchParams.set('apiHost', apiHost)
  url.searchParams.set('child', childUrl.href)

  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 })
  let waitTimedOut = false
  try {
  await page.waitForFunction(
    currentParent
      ? () => window.__currentOldEmbedProbe?.done === true
      : () => window.__oldEmbedProbe?.done === true,
    null,
    { timeout: timeoutMs + 15000 }
  )
  }
  catch (error) {
    waitTimedOut = true
    console.warn(`Probe wait timed out after ${timeoutMs + 15000}ms: ${error.message}`)
  }

  const result = await page.evaluate(() => ({
    probe: window.__oldEmbedProbe || window.__currentOldEmbedProbe,
    parentLocation: location.href,
    iframe: {
      src: document.getElementById('child-frame')?.src,
      width: document.getElementById('child-frame')?.clientWidth,
      height: document.getElementById('child-frame')?.clientHeight
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
            childEvents: window.__oldChildEvents || null
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

  result.consoleMessages = consoleMessages
  result.pageErrors = pageErrors
  result.requestFailures = requestFailures
  result.httpErrors = httpErrors
  result.screenshotPath = screenshotPath
  result.waitTimedOut = waitTimedOut

  await writeFile(outputPath, JSON.stringify(result, null, 2))

  const eventCounts = result.probe.events.reduce((counts, event) => {
    counts[event.type] = (counts[event.type] || 0) + 1
    return counts
  }, {})
  const childDocument = result.frameDocuments.find(frame => frame.url.includes(childHost))

  console.log(JSON.stringify({
    outputPath,
    screenshotPath,
    waitTimedOut,
    opened: result.probe.opened,
    closed: result.probe.closed,
    iframeSrc: result.iframe.src,
    eventCounts,
    parentEvents: result.probe.events,
    childEvents: childDocument?.document?.childEvents || null,
    pageErrors,
    httpErrors,
    requestFailures
  }, null, 2))
}
catch (error) {
  console.error(error.stack || error.message)
  process.exitCode = 1
}
finally {
  await browser?.close()
  await server.close()
}
