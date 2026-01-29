import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // SECURITY: Bind to localhost only to prevent network exposure
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:5001',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      }
    }
  }
})
