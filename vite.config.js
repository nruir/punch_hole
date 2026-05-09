import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

const jsonDbPlugin = () => ({
  name: 'json-db-plugin',
  configureServer(server) {
    const dbPath = path.resolve(__dirname, 'feed.json')

    server.middlewares.use(async (req, res, next) => {
      if (req.url === '/api/feed' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json')
        if (fs.existsSync(dbPath)) {
          res.end(fs.readFileSync(dbPath, 'utf-8'))
        } else {
          res.end('[]')
        }
        return
      }

      if (req.url === '/api/feed' && req.method === 'POST') {
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          fs.writeFileSync(dbPath, body)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ success: true }))
        })
        return
      }

      next()
    })
  }
})

// https://vite.dev/config/
export default defineConfig({
  base: '/punch_hole/',
  plugins: [
    tailwindcss(),
    react(),
    jsonDbPlugin()
  ],
  server: {
    watch: {
      ignored: ['**/feed.json']
    }
  }
})
