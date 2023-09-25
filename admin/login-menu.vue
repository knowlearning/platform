<template>
  <div>
    <button v-if="google" @click="login('google')">google</button>
    <button v-if="microsoft" @click="login('microsoft')">microsoft</button>
    <input
      type="text"
      v-model="username"
      placeholder="username"
      @keypress.enter="login()"
      @keypress="error = null"
    />
    <input
      type="password"
      v-model="password"
      placeholder="password"
      @keypress.enter="login()"
      @keypress="error = null"
    />
    <button @click="login()">sign in</button>
    <div v-if="error">{{ error }}</div>
  </div>
</template>

<script>
  export default {
    props: {
      google: {
        type: Boolean,
        default: false
      },
      microsoft: {
        type: Boolean,
        default: false
      }
    },
    data() {
      return {
        username: '',
        password: '',
        error: null
      }
    },
    methods: {
      async login(provider='email') {
        const { username, password } = this
        const { success } = await Agent.login(provider, username, password)
        if (!success) {
          this.error = 'Invalid Username or Password'
          this.password = ''
        }
      }
    }
  }
</script>