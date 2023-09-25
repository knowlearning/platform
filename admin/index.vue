<template>
  <div v-if="provider === null">initializing...</div>
  <LoginMenu
    v-else-if="provider === 'anonymous'"
    google
    microsoft
  />
  <div v-else id="wrapper" :style="{ 'pointer-events': saving ? 'none' : 'auto' }">
    <user-profile-image :user="user" />
    <button @click="create">create content</button>
    <button @click="() => upload()">upload file</button>
    <button @click="() => upload(true)">upload folder</button>
    <button @click="logout">log out</button>
    <Window
      v-for="([wid, { root }]) in Object.entries(windows)"
      :key="wid"
      v-model="windows[wid]"
      :resizing="resizing"
      @resizing="resizing = $event"
      @focus="bringToFront(wid)"
      @move="Object.assign(windows[wid], $event)"
      @save="handleSave(wid, null, $event)"
      @updateMetadata="handleSave(wid, $event, {})"
      @watchScope="watchScope"
      @exit="closeWindow(wid)"
      @setDragging="dragging = $event ? {wid, root, ...$event} : null"
    />
    <div
      v-if="saving"
      id="saving-wrapper"
      :style="{ zIndex: Object.keys(windows).length  + 1}"
    >
      <div>Saving...</div>
    </div>
    <DomainConfig />
  </div>
  <input
    style="display: none;"
    type="file"
    :ref="el => initFileInput(el)"
    multiple
  />
</template>

<script>
  import { v1 as uuid } from 'uuid'
  import Window from './window.vue'
  import LoginMenu from './login-menu.vue'
  import handleSave from './methods/save.js'
  import handleDrop from './methods/drop.js'
  import initFileInput from './methods/init-file-input.js'
  import ContentTag from './content-tag.vue'
  import UserProfileImage from './user-profile-image.vue'
  import DomainConfig from './domain-config.vue'

  const WATCH_SCOPE_CONTENT = './watch-scope.js'

  let lastTimestamp = null
  const uniqueTimestamp = () => {
    let ts = Date.now()
    if (ts <= lastTimestamp) ts = lastTimestamp + 1
    lastTimestamp = ts
    return ts
  }

  export default {
    components: {
      Window,
      LoginMenu,
      ContentTag,
      UserProfileImage,
      DomainConfig
    },
    data() {
      return {
        user: null,
        provider: null,
        windows: {},
        saving: false,
        dragging: null,
        resizing: false
      }
    },
    async created() {
      this.saving = false
      this.resizing = false
      this.dragging = null
      const { auth: { user, provider } } = await Agent.environment()
      this.user = user
      this.provider = provider
      window.addEventListener('dragover', this.handleDragover)
      window.addEventListener('drop', this.handleDrop)
    },
    unmounted() {
      window.removeEventListener('dragover', this.handleDragover)
      window.removeEventListener('drop', this.handleDrop)
    },
    methods: {
      handleSave,
      handleDrop,
      initFileInput,
      watchScope(scope) {
        this
          .addWindow(
            WATCH_SCOPE_CONTENT,
            30, 30,
            WATCH_SCOPE_CONTENT,
            scope
          )
      },
      async create() {
        const id = await Agent.upload('New Content', 'text/plain', '')
        this.addWindow(id, 30, 30, id)
      },
      upload(isFolder) {
        const input = this.fileInput
        if (isFolder) input.setAttribute('webkitdirectory', '')
        else input.removeAttribute('webkitdirectory')
        input.click()
      },
      logout() {
        if (confirm('Are you sure you want to log out?')) Agent.logout()
      },
      async addWindow(id, x, y, root, scope=uuid(), state) {
        const width = 40
        const height = 40
        const z = Object.keys(this.windows).length
        let windowId = uniqueTimestamp()
        if (state) {
          const patch = [{
            op: 'add',
            path: '',
            JSONPath: '$',
            value: state
          }]
          Agent.interact(scope, patch)
        }
        this.windows[windowId] = {
          id,
          scope,
          x, y, z,
          width, height,
          type: 'view',
          root,
          open: {}
        }
      },
      handleDragover(event) {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      },
      closeWindow(wid) {
        delete this.windows[wid]
      },
      bringToFront(wid) {
        const { windows } = this
        const allWid = Object.keys(windows)
        allWid
          .filter(id => id !== wid)
          .sort((a, b) => windows[a].z - windows[b].z)
          .forEach((wid, index) => windows[wid].z = index)
        windows[wid].z = allWid.length
      }
    }
  }
</script>

<style>
  body
  {
    margin: 0;
  }

  #wrapper
  {
    height: 100vh;
    z-index: 1;
    background: linear-gradient(#EEEEEE, #E0E0E0, #DDDDDD);
  }

  #saving-wrapper
  {
    animation: pulse-background 2s infinite, fade-in 0.5s;
    color: white;
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    font-size: 32px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  @keyframes pulse-background
  {
    0%   { background: rgba(0,0,0,0.1); }
    50%  { background: rgba(0,0,0,0.15); }
    100% { background: rgba(0,0,0,0.1); }
  }

  @keyframes fade-in
  {
    0%   { opacity:0; }
    100% { opacity:1; }
  }

</style>
