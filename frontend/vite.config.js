import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/WEBTOON/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/WEBTOON/api': {
        target: 'https://ssagda.com',
        secure: true,
        changeOrigin: true,
      },
      '/WEBTOON/storage': {
        target: 'https://ssagda.com',
        secure: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['access-control-allow-origin'] = '*';
          });
        },
      },
    },
  },
})
