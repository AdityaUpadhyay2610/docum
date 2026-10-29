import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function vercelCspPlugin() {
  return {
    name: 'vercel-csp-injector',
    buildStart() {
      const env = loadEnv(process.env.NODE_ENV || 'production', process.cwd(), '')
      const apiUrl = process.env.VITE_API_URL || env.VITE_API_URL
      if (!apiUrl) return

      try {
        const origin = new URL(apiUrl).origin
        const vercelPath = path.resolve(__dirname, 'vercel.json')
        if (fs.existsSync(vercelPath)) {
          const config = JSON.parse(fs.readFileSync(vercelPath, 'utf8'))
          const cspHeader = config.headers?.[0]?.headers?.find((h) => h.key === 'Content-Security-Policy')
          if (cspHeader && !cspHeader.value.includes(origin)) {
            cspHeader.value = cspHeader.value.replace("connect-src 'self'", `connect-src 'self' ${origin}`)
            fs.writeFileSync(vercelPath, JSON.stringify(config, null, 2) + '\n')
          }
        }
      } catch (err) {
        console.warn('Could not inject VITE_API_URL into vercel.json:', err.message)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    vercelCspPlugin(),
  ],
})
