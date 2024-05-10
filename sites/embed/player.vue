<template>
  <div
    id="player"
    v-if="embedding.id"
  >
    <vueEmbedComponent
      v-if="embedded"
      :key="embedding.id"
      :id="embedding.id"
      @close="handleClose"
      allow="camera;microphone;fullscreen"
    />
    <Splitter
      v-else
      style="height: 100%"
      @resizestart="resizing=true"
      @resizeend="resizing=false"
    >
      <SplitterPanel :size="75">
        <vueEmbedComponent
          :key="`${embedding.id}/${lastLoad}`"
          :id="embedding.id"
          @state="handleState"
          @close="handleClose"
          allow="camera;microphone;fullscreen"
          :style="{
            'pointer-events': resizing ? 'none' : ''
          }"
        />
      </SplitterPanel>
      <SplitterPanel :size="25">
        <div style="height: 100%; overflow: scroll;">
          <Button
            icon="pi pi-replay"
            label="Reload"
            @click="reload"
          />
          <Button
            icon="pi pi-pencil"
            label="Edit"
            @click="router.push(`/edit/${props.id}`)"
          />
          <ul class="m-0 p-0 list-none border-1 surface-border border-round p-3 flex flex-column gap-2 w-full md:w-30rem">
            <li
                v-for="{ scope, user, domain } in states"
                :key="scope"
            >
              <div>
                <span>{{ scope }} {{ user }} {{ domain }}</span>
              </div>
              scope:
              <pre><vueScopeComponent
                :id="scope"
                :user="user"
                :domain="domain"
              /></pre>
            </li>
            <div v-if="closed">
              <h3>Closed!</h3>
              <pre>info passed: {{ closeInfo }}</pre>
            </div>
          </ul>
        </div>
      </SplitterPanel>
    </Splitter>
  </div>
  <div v-else>
    No content has been embedded here! {{ embedding.id }}
  </div>
</template>

<script setup>
  import { ref, reactive } from 'vue'
  import { useRouter } from 'vue-router'
  import { vueEmbedComponent, vueScopeComponent } from '@knowlearning/agents/vue.js'
  import Button from 'primevue/button'
  import Splitter from 'primevue/splitter'
  import SplitterPanel from 'primevue/splitterpanel'

  const router = useRouter()
  const props = defineProps(['id'])
  const resizing = ref(false)
  const states = reactive([])
  const closeInfo = ref(null)
  const closed = ref(false)
  const lastLoad = ref(Date.now())

  const embedded = Agent.embedded
  const embedding = ref(await Agent.state(props.id))

  function handleState(info) {
    const existing = states.find(s => info.scope === s.scope && info.user === s.user && info.domain === s.domain)
    if (!existing) states.push(info)
  }

  const copy = x => JSON.parse(JSON.stringify(x))

  let candliGameId
  if (embedding.value.id.startsWith('https://cand.li/')) {
    candliGameId = (new URL(embedding.value.id)).searchParams.get('game')
  }

  await clearOutLatestCompetencies()

  async function clearOutLatestCompetencies() {
    if (!candliGameId) return

    const competencies = await Agent.state(`pila/latest_competencies/${candliGameId}`)
    Object.keys(competencies).forEach(key => delete competencies[key])
  }

  //  candli example: https://cand.li/dev/testing-release-pila/pila-play.html?game=0adb500fa86a5cc6b62ab7ca3680ec64
  async function handleClose(info) {
    closed.value = true
    if (embedded) {
      if (candliGameId) {
        const latestCompetencies = await Agent.state(`pila/latest_competencies/${candliGameId}`)
        Agent.close({ competencies: copy(latestCompetencies) })
      }
      else Agent.close(info)
    }
    else {
      closeInfo.value = info
    }
    await clearOutLatestCompetencies()
  }

  function reload() {
    closed.value = false
    states.splice(0, states.length)
    lastLoad.value = Date.now()
  }
</script>

<style scoped>
  #player
  {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  #player > iframe
  {
    display: block;
    margin: 0;
  }

</style>