<template>
  <v-container>
    <v-card
      :elevation="6"
      class="mx-auto"
      max-width="340"
      :title="embedding.name"
    >
      <template v-slot:text>
        <v-img :src="embeddingImageURL" />
      </template>
      <template v-slot:actions>
        <v-btn
          append-icon="fa-solid fa-play"
          color="blue-lighten-2"
          text="Preview"
          variant="outlined"
          @click="router.push(`/${props.id}`)"
        />
      </template>
    </v-card>
    <v-text-field v-model="embedding.name" label="Name" />
    <v-text-field v-model="embedding.id" label="UUID or Url" />
    <v-btn
      @click="uploadCardImage"
      block
    >
      <template v-slot:prepend>
        <v-icon icon="fa-solid fa-upload"></v-icon>
      </template>
      Upload Card Image
    </v-btn>
  </v-container>
</template>

<script setup>
  import { ref, reactive, watch } from 'vue'
  import { useRouter } from 'vue-router'

  const router = useRouter()
  const props = defineProps(['id'])
  const auth = ref(null)
  const embedding = reactive(await Agent.state(props.id))
  const embeddingImageURL = ref(null)

  const p = embedding.picture
  embeddingImageURL.value = p ? await Agent.download(p).url() : null

  watch(() => embedding?.picture, async () => {
    const picture = embedding?.picture
    embeddingImageURL.value = picture ? await Agent.download(picture).url() : null
  })

  async function uploadCardImage() {
    const id = await Agent.upload({
      browser: true,
      accept: 'image/*'
    })
    if (id) embedding.picture = id
  }

</script>