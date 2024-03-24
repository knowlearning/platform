<template>
  <div>
    <img :src="metadata.picture" />
  </div>
</template>

<script>
  export default {
    props: {
      user: { type: String }
    },
    data() {
      return {
        metadata: {}
      }
    },
    async created() {
      //  TODO: user not found picture image reference
      this.metadata = await Agent.metadata(this.user) || { picture: null }
    }
  }
</script>

<style scoped>
  img
  {
    width: 48px;
    height: 48px;
    border-radius: 24px;
    box-shadow:
      rgb(0 0 0 / 25%) 0px 0.0625em 0.0625em,
      rgb(0 0 0 / 25%) 0px 0.125em 0.5em,
      rgb(255 255 255 / 10%) 0px 0px 0px 1px inset;
  }
</style>