<template>
  <v-container>
    <v-form>
      <v-text-field v-model="embedding.name" label="Name" />
      <v-text-field v-model="embedding.id" label="UUID or Url" />
      <v-img
        :key="embedding.picture"
        style="max-height: 128px"
        :src="embeddingImageURL"
      />
      <v-btn
        @click="uploadCardImage"
        class="mt-4"
        prepend-icon="fa-solid fa-upload"
        block
      >
        Upload Card Image
      </v-btn>
      <v-btn
        append-icon="fa-solid fa-play"
        class="mt-4"
        text="Preview"
        @click="router.push(`/${props.id}`)"
        block
      />
    </v-form>
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