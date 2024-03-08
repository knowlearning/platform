// vite.config.js
import { defineConfig } from "file:///home/jason/knowlearing/platform/tools/sequence/node_modules/.pnpm/vite@5.0.7/node_modules/vite/dist/node/index.js";
import vue from "file:///home/jason/knowlearing/platform/tools/sequence/node_modules/.pnpm/@vitejs+plugin-vue@4.5.2_vite@5.0.7_vue@3.3.4/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import basicSsl from "file:///home/jason/knowlearing/platform/tools/sequence/node_modules/.pnpm/@vitejs+plugin-basic-ssl@1.0.2_vite@5.0.7/node_modules/@vitejs/plugin-basic-ssl/dist/index.mjs";
var __vite_injected_original_dirname = "/home/jason/knowlearing/platform/tools/sequence";
var vite_config_default = defineConfig({
  server: {
    port: 5114
  },
  build: {
    target: "esnext"
  },
  plugins: [
    vue(),
    basicSsl()
  ],
  resolve: {
    alias: [
      {
        find: "@knowlearning/agents/vue.js",
        replacement: __vite_injected_original_dirname + "/../../agents/vue.js"
      },
      {
        find: "@knowlearning/agents/browser.js",
        replacement: __vite_injected_original_dirname + "/../../agents/browser.js"
      }
    ]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9qYXNvbi9rbm93bGVhcmluZy9wbGF0Zm9ybS90b29scy9zZXF1ZW5jZVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvamFzb24va25vd2xlYXJpbmcvcGxhdGZvcm0vdG9vbHMvc2VxdWVuY2Uvdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvamFzb24va25vd2xlYXJpbmcvcGxhdGZvcm0vdG9vbHMvc2VxdWVuY2Uvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHZ1ZSBmcm9tICdAdml0ZWpzL3BsdWdpbi12dWUnXG5pbXBvcnQgYmFzaWNTc2wgZnJvbSAnQHZpdGVqcy9wbHVnaW4tYmFzaWMtc3NsJ1xuXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogNTExNCxcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICB0YXJnZXQ6ICdlc25leHQnXG4gIH0sXG4gIHBsdWdpbnM6IFtcbiAgICB2dWUoKSxcbiAgICBiYXNpY1NzbCgpXG4gIF0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczogW1xuICAgICAge1xuICAgICAgICBmaW5kOiAnQGtub3dsZWFybmluZy9hZ2VudHMvdnVlLmpzJyxcbiAgICAgICAgcmVwbGFjZW1lbnQ6IF9fZGlybmFtZSArICcvLi4vLi4vYWdlbnRzL3Z1ZS5qcydcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIGZpbmQ6ICdAa25vd2xlYXJuaW5nL2FnZW50cy9icm93c2VyLmpzJyxcbiAgICAgICAgcmVwbGFjZW1lbnQ6IF9fZGlybmFtZSArICcvLi4vLi4vYWdlbnRzL2Jyb3dzZXIuanMnXG4gICAgICB9XG4gICAgXVxuICB9XG59KVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUErVCxTQUFTLG9CQUFvQjtBQUM1VixPQUFPLFNBQVM7QUFDaEIsT0FBTyxjQUFjO0FBRnJCLElBQU0sbUNBQW1DO0FBS3pDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxFQUNSO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsRUFDVjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsSUFBSTtBQUFBLElBQ0osU0FBUztBQUFBLEVBQ1g7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMO0FBQUEsUUFDRSxNQUFNO0FBQUEsUUFDTixhQUFhLG1DQUFZO0FBQUEsTUFDM0I7QUFBQSxNQUNBO0FBQUEsUUFDRSxNQUFNO0FBQUEsUUFDTixhQUFhLG1DQUFZO0FBQUEsTUFDM0I7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
