<template>
  <div>
    <v-btn
      @click="runTests"
      text="Run Tests"
    />
  </div>
  <div v-if="testConfig">
    <ReportViewer
      :key="testConfig.report"
      :report="testConfig.report"
    />
  </div>
</template>

<script setup>
  import { watch, ref } from 'vue'
  import ReportViewer from './report-viewer.vue'

  const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

  const props = defineProps({ domain: String })
  const testDomain =`${props.domain}.test`
  const testConfig = ref(null)

  Agent
    .query('current-config', [testDomain])
    .then(([config]) => {
      if (config) testConfig.value = config
    })

  watch(testConfig, () => {
    //  TODO: start watching test config report for end
  })

  async function runTests() {
    const parentConfig = (await Agent.query('current-config', [props.domain]))[0]

    await Agent.create({
      active: { config: parentConfig.config, report: Agent.uuid(), domain: testDomain },
      active_type: DOMAIN_CONFIG_TYPE
    })

    await Agent.synced()

    testConfig.value = (await Agent.query('current-config', [testDomain]))[0]
  }
</script>