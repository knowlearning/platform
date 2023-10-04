import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({
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
        replacement: __dirname + '/../lib/vue.js'
      },
      {
        find: '@knowlearning/agents',
        replacement: __dirname + '/../lib/browser.js'
      },
      {
        find: 'fast-json-patch',
        replacement: 'node_modules/fast-json-patch/index.mjs'
      },
      {
        find: 'uuid',
        replacement: 'node_modules/uuid/dist/esm-browser/index.js'
      }
    ]
  }
})
