import { onMounted, onUnmounted } from 'vue'
import draggable from './draggable.js'

export default function makeGutterDraggable(cm, emit) {
  let dragTeardown
  onMounted(() => {
    const view = cm.value?.view
    const gutterEl = view.dom.querySelector('.cm-gutters')
    const emitGutterDrag = event => emit('gutter-drag', event)

    const teardown = draggable(gutterEl)
    gutterEl.addEventListener('drag', emitGutterDrag)

    dragTeardown = () => {
      teardown()
      gutterEl.removeEventListener('drag', emitGutterDrag)
    }
  })

  onUnmounted(() => {
    dragTeardown?.()
  })
}