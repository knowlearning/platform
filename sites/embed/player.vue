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
    />
    <Splitter
      v-else
      style="height: 100%"
      @resizestart="resizing=true"
      @resizeend="resizing=false"
    >
      <SplitterPanel :size="75">
        <vueEmbedComponent
          :style="{
            'pointer-events': resizing ? 'none' : ''
          }"
          :key="`${embedding.id}/${lastLoad}`"
          :id="embedding.id"
          @state="handleState"
          @close="handleClose"
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
  const lastLoad = ref(Date.now())

  const embedded = Agent.embedded
  const embedding = ref(await Agent.state(props.id))

  function handleState(info) {
    const existing = states.find(s => info.scope === s.scope && info.user === s.user && info.domain === s.domain)
    if (!existing) states.push(info)
  }

  function handleClose(info) {
    console.log('INFO!!!', info)
    router.push(`/edit/${props.id}`)
  }

  function reload() {
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