<template>
  <div>
    <div>
      <v-virtual-scroll
        :height="300"
        :items="agentLogs"
      >
        <template v-slot:default="{ item }">
          {{ item }}
        </template>
      </v-virtual-scroll>
    </div>
  </div>
</template>

<script>
const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

export default {
  props: {
    domain: String
  },
  data() {
    return {
      agentLogs: []
    }
  },
  async created() {
    const { auth: { user, provider } } = await Agent.environment()
    Agent.watch(
      'sessions',
      ({ patch, state }) => patch && patch.forEach(({ op, path, value }) => {
        if ((op === 'add' || op === 'replace') && path.length === 2 && path[1] === 'log') {
          const [ serverSession ] = path
          this.agentLogs.push([serverSession, value])
        }
      }),
      this.domain,
      this.domain
    )
  }
}

</script>