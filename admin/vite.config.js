import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 5111,
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
        find: '@knowlearning/agents/vue.js',
        replacement: __dirname + '/../agents/vue.js'
      },
      {
        find: '@knowlearning/agents/browser.js',
        replacement: __dirname + '/../agents/browser.js'
      },
      {
        find: '@knowlearning/patch-proxy',
        replacement:  __dirname + 'node_modules/@knowlearning/patch-proxy/index.js'
      },
      {
        find: 'fast-json-patch',
        replacement: __dirname + '/node_modules/fast-json-patch/index.mjs'
      },
      {
        find: 'uuid',
        replacement: __dirname + '/node_modules/uuid/dist/esm-browser/index.js'
      }
    ]
  }
})
