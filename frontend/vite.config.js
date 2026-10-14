import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss(), {
    name: 'build-info',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify({ staticSite: process.env.VITE_PUBLIC_STATIC === 'true' }) }); },
  }],
  server: {
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:5001', '/media': 'http://127.0.0.1:5001' },
  },
})
