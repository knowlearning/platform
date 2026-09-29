import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    basicSsl()
  ],
  resolve: {
    dedupe: ['@knowlearning/patch-proxy', 'fast-json-patch', 'socket.io-client', 'uuid']
  },
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        agents: 'agents.js'
      },
      preserveEntrySignatures: 'strict',
      output: {
        entryFileNames: '[name].js'
      }
    }
  }
})
