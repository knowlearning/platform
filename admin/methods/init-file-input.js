import { v1 as uuid } from 'uuid'
import createFolderContent from '../create-folder-content.js'

export default function initFileInput(el) {
  if (el === null || this.fileInput === el) return
  this.fileInput = el

  el.value = ''
  el
    .addEventListener(
      'change',
      async () => {
        const { files } = el

        let entries
        if (files.length === 1) {
          const file = files[0]
          entries = [{ name: file.name, fullPath: file.name, file }]
        }
        else {
          entries = (
            [...files]
              // ignore hidden files and directories
              .filter((file) => {
                const path = file.webkitRelativePath
                if (!path) throw new Error('Files must include relative path info. Browser not supported.')
                return path[0] !== '.' && !path.includes('/.')
              })
              .map(file => ({
                name: file.name,
                fullPath: file.webkitRelativePath,
                file
              }))
          )
        }
        el.value = ''
        if (entries.length === 0) return

        //  TODO: show upload progress...
        const extensionToView = extension => ({
          'vue': '../../view/vue3-component.js',
          'vue3.js': '../../view/vue3-app.js',
          'raw.js': '',
          'js': '../../view/view-javascript-self-rendered.js',
          'json': '../../view/view-json-raw.js',
          'yaml': '../../view/view-raw.js',
          'html': '../../view/view-raw.js',
          'map.json': '../../view/map-viewer.js',
          'karel.json': '../../view/karel-viewer.js',
          'assignment.json': 'view-assignment.knowlearning.systems'
        }[extension])
        const getType = ({ file }) => file.type
        const getData = ({ file }) => file.arrayBuffer()
        const roots = await createFolderContent(entries, Agent.upload, uuid, extensionToView, getType, getData)
        this.addWindow(
          '../../edit/content-explorer.vue',
          30,
          30,
          '../../edit/content-explorer.vue',
          uuid(),
          { ids: roots, paths: {} }
        )
      },
      false
    )
}