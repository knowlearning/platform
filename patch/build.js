import fs from 'fs'
import { JSDOM } from 'jsdom'
import { rollup } from 'rollup'
import { v1 as uuid } from 'uuid'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import vue3 from '@vitejs/plugin-vue'
import styles from '@ironkinoko/rollup-plugin-styles'
import replace from '@rollup/plugin-replace'
import json from '@rollup/plugin-json'
import image from '@rollup/plugin-image'
import nodePolyfills from 'rollup-plugin-polyfill-node'
import LoadContent from './load-content.js'

const { CACHE_DIRECTORY } = process.env
const moduleDirectory = `${CACHE_DIRECTORY}/node_modules`

const isUUID = x => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)

if (!fs.existsSync(CACHE_DIRECTORY)) fs.mkdirSync(CACHE_DIRECTORY)
if (!fs.existsSync(moduleDirectory)) fs.mkdirSync(moduleDirectory)

const buildHTML = async (id) => {
  //  build each entry script individually with webpack
  const outputFilename =`${CACHE_DIRECTORY}/build.${id}`
  const dom = new JSDOM(await Agent.download(id).then(data => data.text()))
  const built = await Promise.all(
    [...dom.window.document.getElementsByTagName('script')]
      .map(async script => {
        const src = script.getAttribute('src')
        if (src && isUUID(src)) {
          script.innerHTML = await Agent.download(src).then(data => data.text())
          script.removeAttribute('src')
        }
        if (script.innerHTML) {
          const builtFile = await buildFromSource(script.innerHTML)
          if (script.innerHTML) script.innerHTML = await fs.promises.readFile(builtFile)
        }
      })
  )
  .then(() => dom.serialize())

  await fs.promises.writeFile(outputFilename, built)
  return outputFilename
}

const buildFromSource = async source => {
  const entryId = uuid()
  const buildId = uuid()
  const buildDirectory = `${CACHE_DIRECTORY}/${buildId}`

  const entryFilepath = `${buildDirectory}/${entryId}`
  const outputFilepath = `${buildDirectory}/${buildId}`

  await fs.promises.mkdir(buildDirectory)
  await fs.promises.mkdir(buildDirectory + '/node_modules')
  await fs.promises.writeFile(entryFilepath, source)

  const inputOptions = {
    input: entryFilepath,
    plugins: [
      LoadContent(buildDirectory),
      nodePolyfills(),
      nodeResolve({
        browser: true,
        modulePaths: [`${buildDirectory}/node_modules`],
        jail: buildDirectory
      }),
      commonjs(),
      vue3(),
      styles(),
      replace({
        preventAssignment: true,
        'process.env.NODE_ENV': JSON.stringify( 'production' )
      }),
      json(),
      image()
    ]
  }
  const outputOptions = {
    file: outputFilepath,
    format: 'es'
  }

  //  TODO: add hooks into import identifier resolution so we can download/install as necessary
  const bundle = await rollup(inputOptions)
  await bundle.write(outputOptions)
  await bundle.close()

  return outputFilepath
}

export default async function build(id) {
  //  TODO: get type from download and view from type
  const response = await Agent.download(id)
  const type = response.headers.get('Content-Type')

  //  TODO: decide
  //          a) find viewers based on type and build with those here
  //          b) allow requesting context to determine what environment to build with
  //  TODO: reconsider 'build.ID.js' filename... (maybe even let "buildFromSource" choose temp filename...)
  if (type === 'text/html') {
    return { type, output: await buildHTML(id) }
  }
  else if (type === 'application/javascript') {
    return {
      type: 'application/javascript',
      output: await buildFromSource(`import '${id}'`)
    }
  }
  else {
    throw new Error(`Cannot build content ${id} of type ${type}`)
  }
}
