import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const hmrClientPort = process.env.VITE_HMR_CLIENT_PORT
  ? Number(process.env.VITE_HMR_CLIENT_PORT)
  : undefined;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    hmr: hmrClientPort
      ? { protocol: 'wss', host: 'localhost', clientPort: hmrClientPort }
      : undefined,
  },
})
