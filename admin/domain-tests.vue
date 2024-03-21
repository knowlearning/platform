<template>
  <div>
    <v-btn
      @click="runTests"
      text="Run Tests"
    />
  </div>
  <div v-if="testConfig">
    <v-expansion-panels
      multiple
    >
      <v-expansion-panel
        v-for="step, i in testSteps"
        :key="i"
        :disabled="i > currentStep"
      >
        <v-expansion-panel-title>
          <v-icon
            :color="colorForStep(i)"
            :icon="iconForStep(i)"
          />
          <span class="ms-4">{{ step.name }}</span>
        </v-expansion-panel-title>
        <v-expansion-panel-text v-if="step.resolvedProps">
          <component
            :is="step.component"
            v-bind="step.resolvedProps"
          />
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<script setup>
  import { watch, ref } from 'vue'
  import { vueEmbedComponent } from '@knowlearning/agents/vue.js'
  import ReportViewer from './report-viewer.vue'

  const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

  const props = defineProps({ domain: String })
  const testDomain =`${props.domain}.test`
  const testConfig = ref(null)
  const currentStep = ref(-1)

  Agent
    .query('current-config', [testDomain])
    .then(([config]) => {
      if (config) testConfig.value = config
    })

  const testSteps = [
    {
      name: 'Configure Test Domain',
      component: { template: '<div>woo</div>' },
      props: () => ({}),
      run: async () => {
        // configure domain
        const parentConfig = (await Agent.query('current-config', [props.domain]))[0]
        await Agent.create({
          active: { config: parentConfig.config, report: Agent.uuid(), domain: testDomain },
          active_type: DOMAIN_CONFIG_TYPE
        })
        await Agent.synced()
        return (await Agent.query('current-config', [testDomain]))[0]
      }
    },
    {
      name: 'Wait For Configuration To Complete',
      component: ReportViewer,
      props: config => {
        return {
          key: config.report,
          report: config.report
        }
      },
      run: config => {
        testConfig.value = config

        return new Promise((resolve, reject) => {
          const unwatch = Agent.watch(config.report, ({ state }) => {
            if (state.error) reject()
            if (state.end) resolve()
          })
        })
      }
    },
    {
      name: 'Run Tests',
      component: vueEmbedComponent,
      props: () => {
        //  TODO: pass domain for id, and mode = 'test'
        return {
          id: `${location.protocol}//${props.domain}`,
          mode: 'test',
          namespace: 'test'
        }
      },
      run: () => {}
    }
  ]

  async function runTests() {
    let lastStepResult
    currentStep.value = 0

    testSteps.forEach(step => delete step.resolvedProps)

    for (const step of testSteps) {
      try {
        step.resolvedProps = step.props(lastStepResult)
        lastStepResult = await step.run(lastStepResult)
        currentStep.value += 1
      }
      catch (error) {
        //  TODO: render error on step
        break
      }
    }
    console.log('TESTS COMPLETE!')
  }

  function iconForStep(index) {
    if (index < currentStep.value) return 'fa-solid fa-check'
    else if (index > currentStep.value) return 'fa-solid fa-pause'
    else return 'fa-solid fa-play'
  }

  function colorForStep(index) {
    if (index < currentStep.value) return 'success'
    else if (index > currentStep.value) return 'grey'
    else return 'black'
  }
</script>