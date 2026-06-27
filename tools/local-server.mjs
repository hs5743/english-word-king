import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '127.0.0.1'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
}

const server = http.createServer((req, res) => {
  const rawUrl = (req.url || '/').split('?')[0]
  const urlPath = decodeURIComponent(rawUrl === '/' ? '/index.html' : rawUrl)
  const filePath = path.resolve(root, `.${urlPath}`)

  if (!filePath.startsWith(root)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Forbidden')
    return
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }

    res.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    res.end(data)
  })
})

server.listen(port, host, () => {
  console.log(`Local server running at http://${host}:${port}/`)
})
