import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'lib.browser.js',
      name: 'MyLibrary',
      formats: ['es'],
      fileName: 'browser'
    },
  },
})