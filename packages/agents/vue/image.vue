<template>
  <image
    :key="downloadURL"
    :src="downloadURL"
  />
</template>

<script setup>
  import { ref, watch } from 'vue'
  import downloadURLRegistry from '../download-url-registry.js'

  const props = defineProps({ id: String })

  const downloadURL = ref(downloadURLRegistry[props.id])

  if (!downloadURL.value) setDownloadURL()

  watch(props, setDownloadURL)

  let latestRequest = 0
  async function setDownloadURL() {
    downloadURL.value = null
    latestRequest += 1

    const thisRequest = latestRequest
    const newURL = downloadURLRegistry[props.id] || await Agent.download(props.id).url()

    downloadURLRegistry[props.id] = newURL
    if (latestRequest === thisRequest) downloadURL.value = newURL
  }
</script>