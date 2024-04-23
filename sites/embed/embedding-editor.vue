<template>
  <div>
    <FloatLabel>
      <InputText
        id="embedding-name"
        v-model="embedding.name"
      />
      <label for="embedding-name">Name</label>
    </FloatLabel>
    <FloatLabel>
      <InputText
        id="embedding-id"
        v-model="embedding.id"
      />
      <label for="embedding-id">UUID or URL</label>
    </FloatLabel>
    <img
      :key="embedding.picture"
      style="max-height: 128px"
      :src="embeddingImageURL"
    />
    <Button
      @click="uploadCardImage"
      icon="pi pi-upload"
      label="Upload Card Image"
    />
    <Button
      icon="pi pi-play"
      label="Preview"
      @click="router.push(`/${props.id}`)"
    />
  </div>
</template>

<script setup>
  import { ref, reactive, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import Button from 'primevue/button'
  import InputText from 'primevue/inputtext'
  import FloatLabel from 'primevue/floatlabel'

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