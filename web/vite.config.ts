import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/admin': 'http://localhost:3000', '/v1': 'http://localhost:3000' },
  },
})
