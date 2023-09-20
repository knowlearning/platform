<template>
  <iframe
    :ref="el => setup(el)"
    class="wrapper"
    allow="camera;microphone"
  />
</template>

<script>
export default {
  props: {
    id: {
      type: String,
      required: true
    }
  },
  unmounted() {
    if (this.embedding) this.embedding.remove()
  },
  methods: {
    setup(iframe) {
      if (!iframe || this.iframe === iframe) return

      const { id } = this
      this.iframe = iframe
      this.embedding = Agent.embed({ id }, iframe)
      this.embedding.on('state', e => this.$emit('state', e))
      this.embedding.on('mutate', e => this.$emit('mutate', e))
      this.embedding.on('close', e => this.$emit('close', e))

/*
      const { handle } = this.embedding
      //  if save or edit are listened to, attach handler
      if (this.$attrs.onSave) {
        handle('save', () => new Promise((resolve, reject) => this.$emit('save', { resolve, reject })))
      }
      if (this.$attrs.onEdit) handle('edit', () => this.$emit('edit'))
*/
    }
  }
}

</script>

<style scoped>

.wrapper
{
  width: 100%;
  height: 100%;
  border: none;
}

</style>
