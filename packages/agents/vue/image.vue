<template>
  <img
    :key="downloadURL"
    :src="downloadURL"
  />
</template>

<script setup>
  import { ref, watch } from 'vue'
  import downloadURLRegistry from '../download-url-registry.js'

  const props = defineProps({ id: String })

  let latestURLRequest = 0

  const downloadURL = ref(downloadURLRegistry[props.id])

  if (!downloadURL.value) setDownloadURL()

  watch(props, setDownloadURL)
  async function setDownloadURL() {
    downloadURL.value = null
    latestURLRequest += 1

    const thisRequest = latestURLRequest
    const newURL = downloadURLRegistry[props.id] || await Agent.download(props.id).url()

    downloadURLRegistry[props.id] = newURL
    if (latestURLRequest === thisRequest) downloadURL.value = newURL
  }
</script>
