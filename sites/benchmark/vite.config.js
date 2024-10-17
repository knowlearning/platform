import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 5555,
  },
  build: {
    target: 'esnext'
  },
  plugins: [
    vue(),
    basicSsl()
  ],
  resolve: {
    alias: [
      {
        find: '@knowlearning/agent/vuex.js',
        replacement: __dirname + '/../../packages/agent/vuex.js'
      },
      {
        find: '@knowlearning/agent',
        replacement: __dirname + '/../../packages/agent/browser/browser.js'
      }
    ]
  }
})
