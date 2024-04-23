<template>
  <div v-if="!state.auth?.provider">loading...</div>
  <div v-else-if="state.auth?.provider === 'anonymous'">
    <Button
      prepend-icon="fa-solid fa-right-to-bracket"
      @click="login"
    >
      login
    </Button>
  </div>
  <div v-else>
    <MenuBar>
      <template #start>
      </template>
      <template #end>
        <Button
          @click="logout"
          icon="pi pi-imes"
        >
          Logout
        </Button>
        <Avatar
          shape="circle"
          :image="state.auth.info.picture"
        />
      </template>
    </MenuBar>
    <Splitter>
      <SplitterPanel>
        <ul>
          <li
            v-for="info, id in state.library"
            :value="id"
            :text="id"
            @click="router.push(props.id === id ? '/' : `/edit/${id}`)"
          >
            <vueScopeComponent :id="id" :path="['name']" />
            <Button
              v-if="selected.includes(id)"
              icon="fa-solid fa-xmark"
              variant="plain"
              @click.stop="() => {
                delete state.library[id]
                router.push('/')
              }"
            />
          </li>
        </ul>
        <Button
          @click="createNewEmbedding"
          icon="pi pi-plus"
        >
          Create New Embedding
        </Button>
      </SplitterPanel>
      <SplitterPanel>
        <EmbeddingEditor
          v-if="props.id"
          :key="props.id"
          :id="props.id"
        />
      </SplitterPanel>
    </Splitter>
  </div>
</template>

<script setup>
  import { ref, reactive, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { v4 as uuid } from 'uuid'
  import { vueScopeComponent } from '@knowlearning/agents/vue.js'
  import EmbeddingEditor from './embedding-editor.vue'
  import Button from 'primevue/button'
  import MenuBar from 'primevue/menubar'
  import Avatar from 'primevue/avatar'
  import Splitter from 'primevue/splitter'
  import SplitterPanel from 'primevue/splitterpanel'

  const props = defineProps(['id'])
  const router = useRouter()
  const auth = ref(null)
  const drawer = ref(true)
  const state = reactive({
    auth: null,
    library: null
  })
  const embeddingImageURL = ref(null)
  const selected = ref([props.id])

  watch(() => state.embedding?.picture, async () => {
    const picture = state.embedding?.picture
    embeddingImageURL.value = picture ? await Agent.download(picture).url() : null
  })

  Agent
    .environment()
    .then(({ auth }) => state.auth = auth)

  Agent
    .state('library')
    .then(library => state.library = library)

  function login() { Agent.login() }
  function logout() { Agent.logout() }

  async function createNewEmbedding() {
    const id = uuid()
    state.embedding = await Agent.state(id)
    state.embedding.name = `New Embedding ${(new Date()).toLocaleString()}`
    state.embedding.id = null
    state.embedding.picture = null
    state.library[id] = {}
    router.push(`/edit/${id}`)
  }

</script>