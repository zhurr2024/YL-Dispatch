import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/YL-Dispatch/',
  plugins: [vue()],
  build: { chunkSizeWarningLimit: 1500 },
})
