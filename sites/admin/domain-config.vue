<template>
  <div>
    <div v-if="claimMessage">
      {{ claimMessage }}
      <vueScopeComponent :id="claimReport" />
      <v-btn @click="claimMessage = null">Okay</v-btn>
    </div>
    <v-btn v-else @click="claim">Become admin for {{ domain }}</v-btn>
    <v-btn @click="uploadConfig">Upload</v-btn>
    <div v-if="config">
      config:  {{config.config}}
      <v-btn
        variant="plain"
        @click="downloadConfig(config.config)"
        icon="fa-solid fa-download"
      />
      <ReportViewer
        :key="config.report"
        :report="config.report"
      />
    </div>
    <Suspense>
      <YAMLEditor
        id="some-config-state"
        :resolveLanguage="path => {
          if (path[path.length-1] === 'markdown') return 'markdown'
          if (arrayMatch(['postgres', 'queries', '*', 'body'], path)) return 'postgresql'
          else if (arrayMatch(['agent'], path)) return 'javascript'
        }"
        :resolveWidget="resolveWidget"
      />
    </Suspense>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { vueScopeComponent } from '@knowlearning/agents/vue.js'
import ReportViewer from './report-viewer.vue'
import YAMLEditor from './codemirror/yaml-editor.vue'
import YAMLValueReplacer from './yaml-value-replacer.vue'

const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

const { domain } = defineProps({ domain: String })

const { auth: { user, provider } } = await Agent.environment()
const config = await Agent.state(domain, window.location.host)
const claimMessage = ref(null)
const claimReport = ref(null)

async function claim() {
  const start = Date.now()
  claimMessage.value = 'claiming...'
  const { token, report } = await Agent.claim(this.domain)
  claimReport.value = report
  const elapsed = Date.now() - start
  await new Promise(r => setTimeout(r, 500 - elapsed))

  if (domain.startsWith(`${user}.localhost:`)) {
    claimMessage.value = `You are now registered as the admin of ${domain}.`
  }
  else {
    claimMessage.value = `
      Set "${token}" as a TXT record for "${domain}" become the admin.
      Alternatively, make your website "${domain}/.well-known/knowlearning-admin-challenge" respond with "${token}"
    `
  }
}


async function uploadConfig() {
  const id = await Agent.upload({ browser: true, accept: '.yml,.yaml' })

  const report = Agent.uuid()

  await Agent.create({
    active: { config: id, report, domain },
    active_type: DOMAIN_CONFIG_TYPE
  })

  await Agent.synced()

  this.config = (await Agent.query('current-config', [domain]))[0]
}

function downloadConfig(id) {
  Agent.download(id).direct()
}

function resolveWidget(path) {
  if (path[0] === 'widget') {
    return {
      component: YAMLValueReplacer,
      props: {}
    }
  }
  else return null
}

function arrayMatch(a, b) {
  return a.every((v, i) => {
    return v === '*' || b[i] === '*' || v === b[i]
  })
}

</script>

<style>
  .cm-editor {
    height: 80vh;
  }
</style>