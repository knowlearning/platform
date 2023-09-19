<template>
  <span>
  	{{ metadata ? metadata.name.trim() || 'unnamed' : '...' }}
  </span>
</template>

<script>
  export default {
  	props: {
  	  id: String
  	},
  	data() {
  	  return {
  	  	metadata: null
  	  }
  	},
  	async created() {
  	  this.metadata = await Agent.metadata(this.id)
  	}
  }
</script>