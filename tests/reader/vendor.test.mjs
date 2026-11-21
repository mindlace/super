import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import vm from 'node:vm'

const dir = new URL('../../plugins/superpowers-reader/reader/vendor/', import.meta.url)

test('the vendored file is the pinned build and covers the spec\'s languages', async () => {
  const src = await readFile(new URL('highlight.min.js', dir), 'utf8')
  const ctx = {}
  vm.runInNewContext(src, ctx)
  assert.equal(ctx.hljs.versionString, '11.11.1')
  for (const lang of ['ts', 'js', 'json', 'sh', 'sql', 'html', 'css', 'py'])
    assert.ok(ctx.hljs.getLanguage(lang), lang)
  assert.equal(ctx.hljs.getLanguage('svelte'), undefined)
})
test('VERSION records the version and the file\'s SHA-256', async () => {
  const bytes = await readFile(new URL('highlight.min.js', dir))
  const version = await readFile(new URL('VERSION', dir), 'utf8')
  assert.match(version, /^highlight\.js 11\.11\.1$/m)
  assert.ok(version.includes(createHash('sha256').update(bytes).digest('hex')))
})
test('the licence is BSD-3-Clause', async () => {
  assert.match(await readFile(new URL('LICENSE', dir), 'utf8'), /BSD 3-Clause/)
})
