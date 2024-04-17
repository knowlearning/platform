<template>
  <div v-if="!state.auth?.provider">loading...</div>
  <div v-else-if="state.auth?.provider === 'anonymous'">
    <v-btn
      prepend-icon="fa-solid fa-right-to-bracket"
      @click="login"
    >
      login
    </v-btn>
  </div>
  <v-app v-else>
    <v-app-bar
      color="primary"
      prominent
    >
      <v-app-bar-nav-icon
        variant="text"
        @click.stop="drawer = !drawer"
      />
      <v-toolbar-title>Embed</v-toolbar-title>
      <v-btn
        @click="logout"
        append-icon="fa-solid fa-arrow-right-from-bracket"
      >
        Logout
      </v-btn>
      <v-avatar
        class="ms-4 me-4"
        :image="state.auth.info.picture"
      />
    </v-app-bar>
    <v-navigation-drawer
      v-model="drawer"
    >
      <v-list v-model:selected="selected">
        <v-list-item
          v-for="info, id in state.library"
          :value="id"
          :text="id"
          @click="router.push(`/edit/${id}`)"
        >
          <vueScopeComponent :id="id" :path="['name']" />
          <template v-slot:append>
            <v-btn
              v-if="selected.includes(id)"
              icon="fa-solid fa-xmark"
              variant="plain"
              @click.stop="() => {
                delete state.library[id]
                router.push('/')
              }"
            />
          </template>
        </v-list-item>
      </v-list>
      <template v-slot:append>
        <v-btn
          @click="createNewEmbedding"
          block
        >
          <template v-slot:prepend>
            <v-icon icon="fa-solid fa-plus" />
          </template>
          Create New Embedding
        </v-btn>
      </template>
    </v-navigation-drawer>
    <v-main>
      <EmbeddingEditor
        v-if="props.id"
        :key="props.id"
        :id="props.id"
      />
    </v-main>
  </v-app>
</template>

<script setup>
  import { ref, reactive, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { v4 as uuid } from 'uuid'
  import { vueScopeComponent } from '@knowlearning/agents/vue.js'
  import EmbeddingEditor from './embedding-editor.vue'

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