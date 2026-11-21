import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, symlink, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createReaderServer, listenPreferred, preferredPort } from '../../plugins/superpowers-reader/reader/server.mjs'

const SERVER = fileURLToPath(new URL('../../plugins/superpowers-reader/reader/server.mjs', import.meta.url))
const SPEC_CSS = fileURLToPath(new URL('../../superspec/static/spec.css', import.meta.url))
const CSP = "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; " +
  "media-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'"
let root, port, server
const enc = p => p.split('/').map(encodeURIComponent).join('/')
const PNG = Buffer.from(Array.from({ length: 100 }, (_, i) => i))

before(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'reader-')))
  const d = `${root}/proj/docs`
  await mkdir(`${d}/superpowers/specs`, { recursive: true })
  await mkdir(`${d}/notes/assets/foo`, { recursive: true })
  await writeFile(`${d}/superpowers/specs/a-design.html`, '<article><header><h1>A &amp; <em>B</em></h1></header><p>x</p></article>')
  await writeFile(`${d}/notes/foo.html`, '<!-- c -->\n<article><p>no heading</p></article>')
  await writeFile(`${d}/notes/a b#1.html`, '<article><h1>spaced</h1></article>')
  await writeFile(`${d}/notes/page.html`, '<!doctype html><html><body><article></article></body></html>')
  await writeFile(`${d}/notes/empty.html`, '')
  await writeFile(`${d}/notes/script.html`, '<article><script>x()</script><p onclick="x()">y</p></article>')
  await writeFile(`${d}/notes/assets/foo/pic.png`, PNG)
  await writeFile(`${d}/notes/assets/foo/pic.svg`, '<svg/>')
  await writeFile(`${root}/proj/secret.html`, '<article>secret</article>')
  await symlink(`${root}/proj/secret.html`, `${d}/notes/link.html`)
  server = createReaderServer()
  port = await listenPreferred(server, 0)
})
after(async () => {
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections() })
  await rm(root, { recursive: true, force: true })
})

function request(p, { method = 'GET', headers = {}, port: to = port } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: to, path: p, method, headers, agent: false }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end()
  })
}
const get = (p, opts) => request(p, opts)
const doc = rel => `/s${enc(`${root}/proj/docs/${rel}`)}`
const exited = child => new Promise(resolve => child.once('exit', resolve))
const firstLine = stream => new Promise(resolve => {
  let buf = ''
  stream.on('data', c => {
    buf += c
    const i = buf.indexOf('\n')
    if (i >= 0) resolve(buf.slice(0, i + 1))
  })
})
async function freePort() {
  const s = http.createServer()
  await new Promise(r => s.listen(0, '127.0.0.1', r))
  const p = s.address().port
  await new Promise(r => s.close(r))
  return p
}

test('a spec is wrapped in the page', async () => {
  const r = await get(doc('superpowers/specs/a-design.html'))
  assert.equal(r.status, 200)
  assert.equal(r.headers['content-type'], 'text/html; charset=utf-8')
  assert.equal(r.headers['content-security-policy'], CSP)
  const html = r.body.toString()
  assert.match(html, /^<!doctype html>/)
  assert.ok(html.includes('<title>A &amp; B</title>'))
  assert.ok(html.includes('<link rel="stylesheet" href="/_/spec.css">'))
  assert.ok(html.includes('<link rel="stylesheet" href="/_/page.css">'))
  assert.ok(html.includes('<script src="/_/highlight.min.js" defer></script>'))
  assert.ok(html.includes('<script src="/_/page.js" defer></script>'))
  assert.ok(html.includes('<body class="spec-doc">'))
  assert.match(html, /<main data-etag="&quot;[0-9a-f]{40}&quot;"><article><header><h1>A &amp; <em>B<\/em><\/h1>/)
})

test("the page's data-etag is the fragment's ETag, and answers 304 as If-None-Match", async () => {
  const p = doc('superpowers/specs/a-design.html')
  const html = (await get(p)).body.toString()
  const attr = /<main data-etag="([^"]*)">/.exec(html)?.[1]
  assert.ok(attr, 'no data-etag on main')
  const etag = attr.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  const frag = await get(p + '?fragment=1')
  assert.equal(etag, frag.headers.etag)
  const same = await get(p + '?fragment=1', { headers: { 'if-none-match': etag } })
  assert.equal(same.status, 304)
})

test('any docs folder, comments first, title falls back to the file name', async () => {
  const r = await get(doc('notes/foo.html'))
  assert.equal(r.status, 200)
  assert.ok(r.body.toString().includes('<title>foo.html</title>'))
})

test('a name with a space and # is served when encoded', async () => {
  const r = await get(doc('notes/a b#1.html'))
  assert.equal(r.status, 200)
  assert.ok(r.body.toString().includes('spaced'))
})

test('a whole-page html file is not served', async () => {
  assert.equal((await get(doc('notes/page.html'))).status, 404)
  assert.equal((await get(doc('notes/page.html') + '?fragment=1')).status, 404)
})

test('an empty file is not served, and is once it becomes an article', async () => {
  assert.equal((await get(doc('notes/empty.html') + '?fragment=1')).status, 404)
  await writeFile(`${root}/proj/docs/notes/empty.html`, '<article><p>now</p></article>')
  assert.equal((await get(doc('notes/empty.html') + '?fragment=1')).status, 200)
})

test('fragment: bytes, ETag, 304, new ETag after a change', async () => {
  const file = `${root}/proj/docs/notes/frag.html`
  const bytes = '<article><p>one</p></article>'
  await writeFile(file, bytes)
  const url = doc('notes/frag.html') + '?fragment=1'
  const r = await get(url)
  assert.equal(r.status, 200)
  assert.equal(r.body.toString(), bytes)
  const etag = r.headers.etag
  assert.match(etag, /^"[0-9a-f]{40}"$/)
  const same = await get(url, { headers: { 'if-none-match': etag } })
  assert.equal(same.status, 304)
  assert.equal(same.body.length, 0)
  await writeFile(file, '<article><p>two</p></article>')
  const changed = await get(url, { headers: { 'if-none-match': etag } })
  assert.equal(changed.status, 200)
  assert.notEqual(changed.headers.etag, etag)
})

test('script and onclick are inert under the CSP', async () => {
  const r = await get(doc('notes/script.html'))
  assert.equal(r.status, 200)
  assert.equal(r.headers['content-security-policy'], CSP)
  const f = await get(doc('notes/script.html') + '?fragment=1')
  assert.equal(f.body.toString(), await readFile(`${root}/proj/docs/notes/script.html`, 'utf8'))
})

test('outside docs, .., encoded .., a symlink out, a directory: all 404', async () => {
  for (const p of [
    `/s${root}/proj/secret.html`,
    `/s${root}/proj/docs/../secret.html`,
    `/s${root}/proj/docs/%2e%2e/secret.html`,
    doc('notes/link.html'),
    doc('notes/'),
    '/s%E0%A4%A',
    '/s/%E0%A4%A'
  ]) {
    assert.equal((await get(p)).status, 404, p)
  }
})

test('a wrong Host is 403; localhost and 127.0.0.1 pass', async () => {
  const p = doc('notes/foo.html')
  assert.equal((await get(p, { headers: { host: 'evil.example' } })).status, 403)
  assert.equal((await get(p, { headers: { host: `localhost:${port}` } })).status, 200)
  assert.equal((await get(p, { headers: { host: `127.0.0.1:${port}` } })).status, 200)
})

test('POST is 405 with Allow', async () => {
  const r = await get(doc('notes/foo.html'), { method: 'POST' })
  assert.equal(r.status, 405)
  assert.equal(r.headers.allow, 'GET, HEAD')
})

test('HEAD has the headers and no body', async () => {
  const r = await get(doc('notes/foo.html'), { method: 'HEAD' })
  assert.equal(r.status, 200)
  assert.equal(r.headers['content-type'], 'text/html; charset=utf-8')
  assert.equal(r.body.length, 0)
})

test('media: whole, range, open range, unsatisfiable, svg refused', async () => {
  const p = doc('notes/assets/foo/pic.png')
  const whole = await get(p)
  assert.equal(whole.status, 200)
  assert.equal(whole.headers['content-type'], 'image/png')
  assert.equal(whole.headers['accept-ranges'], 'bytes')
  assert.equal(whole.body.length, 100)
  const mid = await get(p, { headers: { range: 'bytes=10-19' } })
  assert.equal(mid.status, 206)
  assert.equal(mid.headers['content-range'], 'bytes 10-19/100')
  assert.deepEqual(mid.body, PNG.subarray(10, 20))
  const open = await get(p, { headers: { range: 'bytes=90-' } })
  assert.equal(open.status, 206)
  assert.equal(open.body.length, 10)
  const suffix = await get(p, { headers: { range: 'bytes=-5' } })
  assert.equal(suffix.status, 206)
  assert.deepEqual(suffix.body, PNG.subarray(95))
  const bad = await get(p, { headers: { range: 'bytes=200-' } })
  assert.equal(bad.status, 416)
  assert.equal(bad.headers['content-range'], 'bytes */100')
  assert.equal((await get(doc('notes/assets/foo/pic.svg'))).status, 404)
})

test("static files: spec.css is superspec's, the others are typed", async () => {
  const css = await get('/_/spec.css')
  assert.equal(css.status, 200)
  assert.equal(css.headers['content-type'], 'text/css; charset=utf-8')
  assert.deepEqual(css.body, await readFile(SPEC_CSS))
  const pageCss = await get('/_/page.css')
  assert.equal(pageCss.status, 200)
  assert.equal(pageCss.headers['content-type'], 'text/css; charset=utf-8')
  for (const p of ['/_/page.js', '/_/highlight.min.js']) {
    const r = await get(p)
    assert.equal(r.status, 200, p)
    assert.equal(r.headers['content-type'], 'text/javascript; charset=utf-8', p)
  }
  for (const p of ['/_/server.mjs', '/_/../server.mjs', '/', '/s']) {
    assert.equal((await get(p)).status, 404, p)
  }
})

test('every answer carries nosniff, no-store and same-origin CORP', async () => {
  const frag = doc('notes/frag.html') + '?fragment=1'
  const etag = (await get(frag)).headers.etag
  const answers = [
    await get(doc('notes/foo.html')),
    await get(frag, { headers: { 'if-none-match': etag } }),
    await get(doc('notes/foo.html'), { headers: { host: 'evil.example' } }),
    await get('/nope'),
    await get(doc('notes/foo.html'), { method: 'POST' }),
    await get(doc('notes/assets/foo/pic.png'), { headers: { range: 'bytes=200-' } })
  ]
  assert.deepEqual(answers.map(a => a.status), [200, 304, 403, 404, 405, 416])
  for (const a of answers) {
    assert.equal(a.headers['x-content-type-options'], 'nosniff')
    assert.equal(a.headers['cache-control'], 'no-store')
    assert.equal(a.headers['cross-origin-resource-policy'], 'same-origin')
  }
  const whole = await get(doc('notes/assets/foo/pic.png'))
  assert.equal(whole.status, 200)
  assert.equal(whole.headers['cross-origin-resource-policy'], 'same-origin')
})

test('the command line prints its port; a taken port falls back', async () => {
  const blocker = http.createServer()
  await new Promise(r => blocker.listen(0, '127.0.0.1', r))
  const P = blocker.address().port
  const child = spawn('node', [SERVER, '--port', String(P)], { stdio: ['ignore', 'pipe', 'inherit'] })
  try {
    const line = await firstLine(child.stdout)
    const got = JSON.parse(line).port
    assert.notEqual(got, P)
    assert.ok(got > 0)
    const r = await request(doc('notes/foo.html'), { port: got })
    assert.equal(r.status, 200)
  } finally {
    const done = exited(child)
    child.kill('SIGTERM')
    await Promise.race([done, new Promise((_, rej) => setTimeout(() => rej(new Error('no exit within 2 s')), 2000).unref())])
    await new Promise(r => blocker.close(r))
  }
  const Q = await freePort()
  const child2 = spawn('node', [SERVER, '--port', String(Q)], { stdio: ['ignore', 'pipe', 'inherit'] })
  try {
    assert.equal(await firstLine(child2.stdout), `{"port": ${Q}}\n`)
  } finally {
    const done = exited(child2)
    child2.kill('SIGTERM')
    await done
  }
})

test('--port: a decimal port is used; empty, non-numeric or out-of-range falls back to 4520', () => {
  assert.equal(preferredPort([]), 4520)
  assert.equal(preferredPort(['--port']), 4520)
  assert.equal(preferredPort(['--port', '0']), 0)
  assert.equal(preferredPort(['--port', '4521']), 4521)
  assert.equal(preferredPort(['--port', '65535']), 65535)
  for (const value of ['', ' ', 'abc', '0x10', '1e3', '4521.5', '65536', '70000', '-1']) {
    assert.equal(preferredPort(['--port', value]), 4520, JSON.stringify(value))
  }
})

test('the command line with an empty --port listens on 4520', async t => {
  const probe = http.createServer()
  const free = await new Promise(resolve => {
    probe.once('error', () => resolve(false))
    probe.listen(4520, '127.0.0.1', () => probe.close(() => resolve(true)))
  })
  if (!free) return t.skip('port 4520 is in use here')
  for (const value of ['', 'abc']) {
    const child = spawn('node', [SERVER, '--port', value], { stdio: ['ignore', 'pipe', 'inherit'] })
    try {
      assert.equal(await firstLine(child.stdout), '{"port": 4520}\n', JSON.stringify(value))
    } finally {
      const done = exited(child)
      child.kill('SIGTERM')
      await done
    }
  }
})

test('the server exits when its parent dies', async () => {
  const script = `const c = require('child_process').spawn(process.execPath, [${JSON.stringify(SERVER)}, '--port', '0'], { stdio: ['ignore', 'pipe', 'inherit'], detached: true }); c.stdout.once('data', () => { console.log(c.pid); process.exit(0) })`
  const parent = spawn('node', ['-e', script], { stdio: ['ignore', 'pipe', 'inherit'] })
  const pid = Number((await firstLine(parent.stdout)).trim())
  await exited(parent)
  assert.ok(pid > 0)
  const deadline = Date.now() + 5000
  let gone = false
  while (Date.now() < deadline) {
    try { process.kill(pid, 0) } catch (e) { if (e.code === 'ESRCH') { gone = true; break } }
    await new Promise(r => setTimeout(r, 200))
  }
  if (!gone) process.kill(pid, 'SIGKILL')
  assert.ok(gone, 'server still running 5 s after its parent died')
})
