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
  <div v-else>
    <v-toolbar color="primary">
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
    </v-toolbar>
    <v-container>
      <div>
        <v-btn @click="createNewEmbedding">
          <template v-slot:prepend>
            <v-icon icon="fa-solid fa-plus" />
          </template>
          Create New Embedding
        </v-btn>
        <v-list>
          <v-list-item
            v-for="info, id in state.library"
            :text="id"
            @click="selectEmbedding(id)"
          >
            <vueScopeComponent :id="id" :path="['name']" />
          </v-list-item>
        </v-list>
      </div>
      <div v-if="state.embedding">
        <v-card
          :elevation="6"
          class="mx-auto"
          color="surface-variant"
          max-width="340"
          subtitle="Take a walk down the beach"
          title="Evening sunset"
        >
          <template v-slot:text>
            <v-img :src="embeddingImageURL" />
          </template>
          <template v-slot:actions>
            <v-btn
              append-icon="fa-solid fa-play"
              color="red-lighten-2"
              text="Preview"
              variant="outlined"
              @click="router.push(`/${state.id}`)"
            />
          </template>
        </v-card>
        <v-text-field v-model="state.embedding.name" label="Name" />
        <v-text-field v-model="state.embedding.id" label="UUID or Url" />
        <v-btn @click="uploadCardImage">
          <template v-slot:prepend>
            <v-icon icon="fa-solid fa-upload"></v-icon>
          </template>
          Upload Card Image
        </v-btn>
      </div>
    </v-container>
  </div>
</template>

<script setup>
  import { ref, reactive, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { v4 as uuid } from 'uuid'
  import { vueScopeComponent } from '@knowlearning/agents/vue.js'

  const router = useRouter()
  const auth = ref(null)
  const state = reactive({
    auth: null,
    id: null,
    embedding: null,
    library: null
  })
  const embeddingImageURL = ref(null)

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

  async function selectEmbedding(id) {
    state.id = id
    state.embedding = await Agent.state(id)
  }

  async function createNewEmbedding() {
    state.id = uuid()
    state.embedding = await Agent.state(state.id)
    state.embedding.name = `New Embedding ${(new Date()).toLocaleString()}`
    state.embedding.id = null
    state.embedding.picture = null
    state.library[state.id] = {}
  }

  async function uploadCardImage() {
    const id = await Agent.upload({
      browser: true,
      accept: 'image/*'
    })
    if (id) state.embedding.picture = id
  }

</script>