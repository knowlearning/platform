import fs from 'fs'
import installJSModules from './install-js-modules.js'
import { typeToExtension } from '../lib/metadata-utils.js'

const isUUID = x => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)

const downloads = {}

function downloadAndSaveContent(dir, id) {
  const downloadId = `${dir}/${id}`
  if (downloads[downloadId]) return downloads[downloadId]

  downloads[downloadId] = (
    Agent
      .download(id)
      .then(async response => {
        const source = await response.text()
        const type = response.headers.get('Content-Type')
        const extension = typeToExtension(type)
        const filename = `${dir}/${id}.${extension}`
        await fs.promises.writeFile(filename, source)
        return filename
      })
  )

  return downloads[downloadId]
}

export default function LoadContent(dir) {
  const installs = {}
  return {
    name: 'load-content',
    async resolveId(importee, importer, resolveOptions) {
      if (isUUID(importee)) return downloadAndSaveContent(dir, importee)
      else if (installs[importee]) {
        await installs[importee].install
        return (
          this
            .resolve(importee, importer, Object.assign({ skipSelf: true }, resolveOptions))
            .then(resolved => {
              if (!resolved) {
                console.log(installs, 'node modules dir:', fs.readdirSync(dir + '/node_modules'))
                console.log('BUUUUUUUUUUUUUUUG, no resolution for: ', importee, importer)
              }
              return resolved || { id: importee }
            })
        )
      }
      else if (importee.startsWith('npm/')) {
        const [_, scope, name, version, ...filepath ] = importee.split('/')
        const scopedName = scope !== 'unscoped' ? `@${scope}/${name}` : name
        const install = installJSModules(dir, `${scopedName}@${version}`)
        installs[scopedName] = { version, install }
        await install
        const id = `${scopedName}${filepath.length ? `/${filepath.join('/')}` : ''}`
        return (
          this
            .resolve(id, importer, Object.assign({ skipSelf: true }, resolveOptions))
            .then(resolved => resolved || { id })
        )
      }
      else {
        const moduleIdentifier = importee.split('/')[0]
        if (installs[moduleIdentifier]) {
          console.log('awaiting install for::::::::::::::::::::::::::::::::::::::::::', moduleIdentifier)
          await installs[moduleIdentifier].install
          return null
        }
        else return null
      }
    }
  }
}
