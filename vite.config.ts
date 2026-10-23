import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { localReferencePlugin } from './dev/localReference'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode, command, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), 'CAPPTRON_')
  return {
    plugins: [
      react(),
      tailwindcss(),
      localReferencePlugin(
        env.CAPPTRON_GOLDEN_B7_NC,
        command === 'serve' && !isPreview && mode === 'development',
      ),
    ],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: env.CAPPTRON_CORE_PROXY
        ? {
            '/core-api': {
              target: env.CAPPTRON_CORE_PROXY,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/core-api/, ''),
            },
          }
        : undefined,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  }
})
