<template>
  <div
    class="window"
    :style="positionStyle"
    @mousedown="$emit('focus')"
    @dragstart="initiateDrag"
    :draggable="draggable"
    @dragend="endDrag"
  >
    <div
      class="header"
      @mouseenter="draggable=true"
      @mouseleave="draggable=false"
    >
      <div class="label">
        <ContentTag :id="this.modelValue.id" />
      </div>
      <div>
        scope:<input v-model="scopeProxy" />
        <button @click="resetScope">reset</button>
        <button @click="$emit('watch-scope', scopeProxy)">watch</button>
      </div>
      <div>
        <span @click="$emit('exit')"> &#10005; </span>
      </div>
    </div>
    <div class="body">
      <Content
        v-if="ready"
        :key="`${modelValue.id}/${modelValue.scope}`"
        :id="modelValue.id"
        :scope="modelValue.scope"
        @save="e => $emit('save', e)"
      />
      <div
        class="se-resizer"
        @mousedown.prevent="dragCorner"
      />
      <div
        v-if="resizing"
        class="drag-cover"
      />
    </div>
  </div>
</template>

<script>
  import ContentTag from './content-tag.vue'

  const RESET_PATCH = [{ op: 'remove', path: [], JSONPath: '$' }]

  export default {
    components: {
      ContentTag
    },
    props: {
      modelValue: Object,
      resizing: Boolean
    },
    data() {
      return {
        dragging: false,
        ready: true,
        draggable: false,
        recentlyUpdated: false
      }
    },
    computed: {
      positionStyle() {
        const { x, y, width, height, z } = this.dimensions
        let style = `
          left: ${x}%;
          top: ${y}%;
          z-index: ${z};
          width: ${width}%;
          height: ${height}%;
          visibility: ${this.dragging ? 'hidden' : 'inherit' };
        `
        return style
      },
      scopeProxy: {
        get() { return this.modelValue.scope },
        async set(scope) {
          this.$emit("update:modelValue", {...this.modelValue, scope })
        }
      },
      dimensions() {
        return this.modelValue
      }
    },
    methods: {
      async resetScope() {
        this.ready = false
        const scope = this.scopeProxy
        const patch = RESET_PATCH
        const timestamp = Date.now()
        await Agent.interact(scope, patch)
        this.ready = true
      },
      async initiateDrag(event) {
        setTimeout(() => this.dragging = true)
        const { offsetX: x, offsetY: y } = event
        this.$emit('setDragging', { offset: { x, y } })
        event.dataTransfer.setData('text/plain', this.modelValue.id)
        const { domain } = await Agent.environment()
        event.dataTransfer.setData('text/uri-list', `${domain}/~${this.modelValue.id}`)
      },
      endDrag() {
        setTimeout(() => this.dragging = false)
        this.$emit('setDragging', null)
      },
      dragCorner(startEvent) {
        this.$emit('resizing', true)
        const { clientX, clientY } = startEvent
        const {width, height} = this.dimensions
        const drag = event => {
          const newDimensions = {
            width:  width  + (event.clientX - clientX) / window.innerWidth * 100,
            height: height + (event.clientY - clientY) / window.innerHeight * 100
          }
          this.$emit('move', newDimensions)
        }
        window.addEventListener('mousemove', drag)
        window.addEventListener('mouseup', () => {
          window.removeEventListener('mousemove', drag)
          this.$emit('resizing', false)
        })
      }
    }
  }
</script>

<style>

.window
{
  position: fixed;
  display: flex;
  flex-direction: column;
  background: white;
  box-shadow:
      rgba(0, 0, 0, 0.25) 0px 0.0625em 0.0625em,
      rgba(0, 0, 0, 0.25) 0px 0.125em 0.5em,
      rgba(255, 255, 255, 0.1) 0px 0px 0px 1px inset;
  border: 1px solid #EEEEEE;
  border-radius: 4px;
  transition: box-shadow 150ms ease-in-out;
}

.window:hover
{
  box-shadow:
      rgba(0, 0, 0, 0.4) 0px 0.0625em 0.0625em,
      rgba(0, 0, 0, 0.4) 0px 0.125em 0.5em,
      rgba(255, 255, 255, 0.2) 0px 0px 0px 1px inset;
}

.header
{
  padding: 4px 8px;
  background: #EEEEEE;
  border-bottom: 1px solid #DDDDDD;
  display: flex;
  justify-content: space-between;
  cursor: move;
  text-shadow: 0px  0px 2px #fff;
  align-items: center;
}

.window-exit
{
  cursor: pointer;
}

.body
{
  flex-grow: 1;
  overflow: hidden;
  position: relative;
}

.se-resizer
{
  position: absolute;
  left: calc(100% - 16px);
  top: calc(100% - 16px);
  width: 16px;
  height: 16px;
  cursor: se-resize;
}

.drag-cover
{
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
}

.mode-select
{
  transition: opacity 100ms;
  opacity: 0.5;
}

.mode-select:hover
{
  opacity: 1;
}

.label
{
  transition: background 200ms ease-out;
}

.updated
{
  background: orange;
}

</style>
