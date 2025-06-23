<script setup>
  import encryptString from '../encrypt-string.js'

  const props = defineProps({ text: String, update: Function })

  async function update() {
    const secret = prompt('Enter your new secret here. It will be encrypted with the server public key for security.')
    if (!secret) return

    const { serverPublicKey } = await Agent.environment()

    const encryptedSecret = await encryptString(serverPublicKey, secret)
    props.update(encryptedSecret)
  }
</script>

<template>
  <span
    style="
      background: orange;
      padding: 0 1ch;
      border-radius: 4px;
      box-shadow: rgba(99, 99, 99, 0.2) 0px 2px 8px 0px;
    "
  > {{ text.slice(0,8) }}...
  	<button @click="update">update</button>
  </span>
</template>