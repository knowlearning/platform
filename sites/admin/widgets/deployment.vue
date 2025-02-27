<script setup>
  import { ref } from 'vue'
  import { validate as isUUID, v4 as uuid } from 'uuid'
  import { vueScopeComponent } from '@knowlearning/agents/vue.js'

  const props = defineProps({ text: String, update: Function })
  const showDeploymentReport = ref(false)

  async function deploy() {
  	props.update(uuid())
    await Agent.synced()
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
  >
    <span
      style="
        position: relative;
        display: inline-block;
      "
      @mouseenter="showDeploymentReport = true"
      @mouseleave="showDeploymentReport = false"
    >[Deployment Id]
      <div
        v-if="showDeploymentReport && isUUID(props.text)"
        @mousedown.stop
        style="
          position: absolute;
          background: white;
          box-shadow: rgba(99, 99, 99, 0.2) 0px 2px 8px 0px;
          border-radius: 4px;
          background: #FAFAFA;
          padding: 1ch;
        "
      >
        <pre>id: {{props.text}}
<vueScopeComponent :key="props.text" :id="props.text" /></pre>
      </div>
    </span>
  	<button @click="deploy">deploy</button>
  </span>
</template>