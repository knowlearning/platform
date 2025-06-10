<script setup>
  import encryptString from '../encrypt-string.js'

  const props = defineProps({ text: String, update: Function })

  const CORE_AUTH_SERVICE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA59Uz6jvBJF3B8/7xMqGo
XkIhLFvTCHuFIGuCNNZGCJUnSk2ne6Jp1ehUIarliJwzrvfr2HMe0PvzAJyZqQIs
uz0Lt867TTojCAKJunxbcrwEhzvz0FNjNu1wpgkSHFvd1uTvRSZqauqUmG0HqC17
HSmBaXivB49B/pviowVJc+mUJJ9MROtOiL4JN5niHnLbt6QVi6NITAJkOwtoRhck
5j0KLvfrq18R8QrfDOq3v5hWlrA6j1wPvTW1mzFk8MrOZw935mMDdMivFAm/DltM
NT5I3YnLZpcl1e/fydC+B6zSz2nZfLb2iDBbADDVj2+i9JUEFomg6ng1DjHUGMYc
ZQIDAQAB
-----END PUBLIC KEY-----
`

  async function update() {
    const secret = prompt('Enter your new secret here. It will be encrypted with the server public key for security.')
    const encryptedSecret = await encryptString(CORE_AUTH_SERVICE_PUBLIC_KEY, secret)
    props.update(encryptedSecret)
  }
</script>

<template>
  <span
    style="
      background: orange;
      padding: 0 1ch;
      border-radius: 4px;
      box-shadow: rgba(99, 99, 99, 0.2) 0px 2px 8px 0px;
    "
  > {{ text.slice(0,8) }}...
  	<button @click="update">update</button>
  </span>
</template>