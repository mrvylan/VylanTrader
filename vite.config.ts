import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const feedPort = env.X_FEED_PORT || env.PORT || '8787'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${feedPort}`,
          changeOrigin: true,
        },
        '/stooq-proxy': {
          target: 'https://stooq.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/stooq-proxy/, ''),
        },
      },
    },
  }
})
