<template>
  <div>
    <v-btn
      @click="runTests"
      text="Run Tests"
    />
  </div>
  <div v-if="testConfigReport">
    <ReportViewer
      :key="testConfigReport"
      :report="testConfigReport"
    />
  </div>
</template>

<script setup>
  import { computed, ref } from 'vue'
  import ReportViewer from './report-viewer.vue'

  const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

  const props = defineProps({ domain: String })
  const testConfigReport = ref(null)
  const testConfig = ref(null)

  async function runTests() {
    const parentConfig = (await Agent.query('current-config', [props.domain]))[0]

    testConfigReport.value = Agent.uuid()
    const domain =`${props.domain}.test`

    await Agent.create({
      active: { config: parentConfig.config, report: testConfigReport.value, domain },
      active_type: DOMAIN_CONFIG_TYPE
    })

    await Agent.synced()

    testConfig.value = (await Agent.query('current-config', [domain]))[0]
  }
</script>