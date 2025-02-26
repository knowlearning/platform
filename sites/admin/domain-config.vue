<template>
  <div>
    <div v-if="claimMessage">
      {{ claimMessage }}
      <vueScopeComponent :id="claimReport" />
      <v-btn @click="claimMessage = null">Okay</v-btn>
    </div>
    <v-btn v-else @click="claim">Become admin for {{ domain }}</v-btn>
    <Suspense>
      <YAMLEditor
        :key="domain"
        :id="`configuration/${domain}`"
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
import DeploymentWidget from './widgets/deployment.vue'

const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

const { domain } = defineProps({ domain: String })

const { auth: { user, provider } } = await Agent.environment()
const myConfig = await Agent.state(domain)
const acceptedConfig = await Agent.state(domain, window.location.host)
const claimMessage = ref(null)
const claimReport = ref(null)

if (!myConfig.deployment) myConfig.deployment = null

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


async function deployConfig() {
  myConfig.deployment = uuid()
  await Agent.synced()
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
  else if (arrayMatch(path, ['deployment'])) {
    return {
      component: DeploymentWidget,
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