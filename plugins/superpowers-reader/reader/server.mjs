import http from 'node:http'
import { createHash } from 'node:crypto'
import { createReadStream, realpathSync } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { posix, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { docKind, startsWithArticle } from './shape.mjs'

const CSP = "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; " +
  "media-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'"
const HERE = new URL('.', import.meta.url)
const HOSTS = new Set(['127.0.0.1', 'localhost'])
const HTML = 'text/html; charset=utf-8'
const STATIC = {
  '/_/spec.css': ['spec.css', 'text/css; charset=utf-8'],
  '/_/page.css': ['page.css', 'text/css; charset=utf-8'],
  '/_/page.js': ['page.js', 'text/javascript; charset=utf-8'],
  '/_/highlight.min.js': ['vendor/highlight.min.js', 'text/javascript; charset=utf-8']
}
const MEDIA_TYPE = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm'
}

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = s => escapeHtml(s).replace(/"/g, '&quot;')
const etagOf = bytes => `"${createHash('sha1').update(bytes).digest('hex')}"`

/** The text of the first h1 with tags removed and white space collapsed, else the file name. */
function titleOf(fragment, file) {
  const m = /<h1[\s>][\s\S]*?<\/h1\s*>/i.exec(fragment)
  if (m) {
    const text = m[0].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    if (text) return text
  }
  return escapeHtml(basename(file))
}

function page(fragment, file, etag) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${titleOf(fragment, file)}</title>
    <link rel="stylesheet" href="/_/spec.css">
    <link rel="stylesheet" href="/_/page.css">
    <script src="/_/highlight.min.js" defer></script>
    <script src="/_/page.js" defer></script>
  </head>
  <body class="spec-doc">
    <main data-etag="${escapeAttr(etag)}">${fragment}</main>
  </body>
</html>
`
}

/** One range of the forms a-b, a-, -n. Returns null (serve whole), 'bad' (416) or {start, end}. */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header ?? '').trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  let start, end
  if (m[1] === '') {
    const n = Number(m[2])
    if (n === 0) return 'bad'
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Number(m[2])
    if (m[2] !== '' && end < start) return null
    end = Math.min(end, size - 1)
  }
  if (start >= size) return 'bad'
  return { start, end }
}

export function createReaderServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, {}, null, req)
      else res.destroy()
    })
  })
}

function send(res, status, headers, body, req) {
  res.writeHead(status, {
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': CSP,
    ...headers
  })
  res.end(req.method === 'HEAD' ? undefined : body ?? undefined)
}

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { Allow: 'GET, HEAD' }, null, req)
  }
  const host = (req.headers.host ?? '').toLowerCase().replace(/:\d*$/, '')
  if (!HOSTS.has(host)) return send(res, 403, {}, null, req)

  const raw = req.url ?? ''
  const q = raw.indexOf('?')
  const pathname = q < 0 ? raw : raw.slice(0, q)
  const query = new URLSearchParams(q < 0 ? '' : raw.slice(q + 1))

  const fixed = STATIC[pathname]
  if (fixed) {
    let bytes
    try { bytes = await readFile(new URL(fixed[0], HERE)) } catch { return send(res, 404, {}, null, req) }
    return send(res, 200, { 'Content-Type': fixed[1], 'Content-Length': bytes.length }, bytes, req)
  }

  if (!pathname.startsWith('/s/')) return send(res, 404, {}, null, req)
  let decoded
  try { decoded = decodeURIComponent(pathname.slice(2)) } catch { return send(res, 404, {}, null, req) }
  const wanted = posix.normalize(decoded)
  const kind = docKind(wanted)
  if (!kind) return send(res, 404, {}, null, req)
  let real, info
  try {
    real = await realpath(wanted)
    if (docKind(real) !== kind) return send(res, 404, {}, null, req)
    info = await stat(real)
  } catch { return send(res, 404, {}, null, req) }
  if (!info.isFile()) return send(res, 404, {}, null, req)

  if (kind === 'media') return media(req, res, real, info.size)

  const bytes = await readFile(real)
  if (!startsWithArticle(bytes.toString('utf8'))) return send(res, 404, {}, null, req)
  const etag = etagOf(bytes)
  if (query.get('fragment') === '1') {
    if (req.headers['if-none-match'] === etag) return send(res, 304, { ETag: etag }, null, req)
    return send(res, 200, { 'Content-Type': HTML, 'Content-Length': bytes.length, ETag: etag }, bytes, req)
  }
  const body = Buffer.from(page(bytes.toString('utf8'), real, etag))
  return send(res, 200, { 'Content-Type': HTML, 'Content-Length': body.length }, body, req)
}

function media(req, res, file, size) {
  const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase()
  const headers = { 'Content-Type': MEDIA_TYPE[ext], 'Accept-Ranges': 'bytes' }
  const range = parseRange(req.headers.range, size)
  if (range === 'bad') return send(res, 416, { 'Content-Range': `bytes */${size}` }, null, req)
  let status = 200
  let start = 0
  let end = size - 1
  if (range) {
    status = 206
    ;({ start, end } = range)
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`
  }
  headers['Content-Length'] = size === 0 ? 0 : end - start + 1
  if (req.method === 'HEAD' || size === 0) return send(res, status, headers, null, req)
  res.writeHead(status, {
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': CSP,
    ...headers
  })
  const stream = createReadStream(file, { start, end })
  stream.on('error', () => res.destroy())
  stream.pipe(res)
}

/** Listens on 127.0.0.1:preferred; on EADDRINUSE listens on port 0. Resolves the bound port. */
export function listenPreferred(server, preferred = 4520) {
  return new Promise((resolve, reject) => {
    const bound = () => resolve(server.address().port)
    const onError = err => {
      if (err.code !== 'EADDRINUSE' || preferred === 0) return reject(err)
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        bound()
      })
    }
    server.once('error', onError)
    server.listen(preferred, '127.0.0.1', () => {
      server.off('error', onError)
      bound()
    })
  })
}

/** The port `--port` asks for; anything but a decimal 0-65535 falls back to 4520. */
export function preferredPort(argv) {
  const i = argv.indexOf('--port')
  const value = i >= 0 ? argv[i + 1] : undefined
  if (typeof value !== 'string' || !/^\d{1,5}$/.test(value)) return 4520
  const asked = Number(value)
  return asked < 65536 ? asked : 4520
}

async function main(argv) {
  const server = createReaderServer()
  const port = await listenPreferred(server, preferredPort(argv))
  process.stdout.write(`{"port": ${port}}\n`)
  const stop = () => process.exit(0)
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, stop)
  const parent = process.ppid
  setInterval(() => { if (process.ppid !== parent) stop() }, 1000).unref()
}

let isEntry = false
try {
  isEntry = !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
} catch {}
if (isEntry) main(process.argv.slice(2)).catch(err => { console.error(err); process.exit(1) })
