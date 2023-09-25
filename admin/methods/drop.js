import { v1 as uuid } from 'uuid'
import createFolderContent from '../create-folder-content.js'
import getAllFileEntries from '../get-all-file-entries.js'

const isUUID = x => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)

export default async function  handleDrop(event) {
  const { clientX, clientY } = event

  const text = event.dataTransfer.getData("text")
  //  TODO: consider parsing out one/multiple ids for drop
  try {
    const { id, root, scope, state } = JSON.parse(text)
    if (id && root) {
      this.addWindow(id, clientX*100/window.innerWidth, clientY*100/window.innerHeight, root, scope, state)
      return
    }
  }
  catch (e) {
    if (isUUID(text.trim())) {
      const id = text.trim()
      const offset = this.dragging ? this.dragging.offset : {x:0,y:0}
      const root = this.dragging ? this.dragging.root : id
      const w = this.dragging && this.dragging.wid && this.windows[this.dragging.wid]

      // ensure window stays completely in frame
      const x = Math.min(
        Math.max(0, clientX - offset.x) * 100 / window.innerWidth,
        100 - (w ? w.width : 0)
      )
      const y = Math.min(
        Math.max(0, clientY - offset.y) * 100 / window.innerHeight,
        100 - (w ? w.height : 0)
      )

      if (w && w.id === id && !event.ctrlKey) {
        w.x = x
        w.y = y
      }
      else this.addWindow(id, x, y, root)
    }
    else if (event.dataTransfer.items.length) {
      //  TODO: show upload progress... perhaps with a different window
      event.preventDefault()
      const entries = await getAllFileEntries(event.dataTransfer.items)
      const roots = await createFolderContent(entries, Agent.upload, uuid)

      console.log('UPLOADED STUFFFF!!!!!!!!... content explorer won\'t work yet', roots)

      this.addWindow(
        '../../edit/content-explorer.vue',
        clientX*100/window.innerWidth,
        clientY*100/window.innerHeight,
        '../../edit/content-explorer.vue',
        uuid(),
        { ids: roots, paths: {} }
      )
    }
  }
  this.dragging = null
  event.preventDefault()
  event.stopPropagation()
}