#!/usr/bin/env node
/**
 * Static server for the visual-review demo. Serves the repository root so the
 * page can load the real `lib/client.js` build output.
 *
 * Portions adapted from:
 * https://github.com/dsh-plugins/dsh-thought-buddy (demo/server.mjs)
 * BSD-3-Clause. See THIRD_PARTY_NOTICES.md.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const port = Number(process.env.PORT ?? 4173)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

createServer((request, response) => {
  const requested = new URL(request.url ?? '/', 'http://localhost').pathname
  const relative = normalize(requested === '/' ? '/demo/index.html' : requested).replace(/^(\.\.[/\\])+/, '')
  const file = join(root, relative)
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end('not found')
    return
  }
  response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(response)
}).listen(port, () => {
  process.stdout.write(`demo: http://localhost:${port}/demo/index.html\n`)
})
