import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'

//  Hack to allow "." in paths for dev server
//  TODO: upgrate to vite 5 on release, and remove this plugin
import pluginRewriteAll from 'vite-plugin-rewrite-all'

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
    basicSsl(),
    pluginRewriteAll()
  ],
  resolve: {
    alias: [
      {
        find: '@knowlearning/agents/vue.js',
        replacement: __dirname + '/../client/vue.js'
      },
      {
        find: '@knowlearning/agents',
        replacement: __dirname + '/../client/browser.js'
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
