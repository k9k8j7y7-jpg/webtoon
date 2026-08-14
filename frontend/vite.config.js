import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/WEBTOON/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/WEBTOON/api': {
        target: 'http://52.79.94.122:8000',
        rewrite: (path) => path.replace(/^\/WEBTOON/, ''),
      },
      '/WEBTOON/storage': {
        target: 'http://52.79.94.122:8000',
        rewrite: (path) => path.replace(/^\/WEBTOON/, ''),
      },
    },
  },
})
