import { expect, test } from 'claude-code/testing'
import type { FsEntry, On } from 'claude-code'

const DOC = '/repo/docs/superpowers/specs/2026-11-20-x-design.html'
const DOC2 = '/repo/docs/notes/a b#1.html'
const WHOLE = '/repo/docs/notes/api.html'
const URL1 = 'http://localhost:4520/s/repo/docs/superpowers/specs/2026-11-20-x-design.html'
const URL2 = 'http://localhost:4520/s/repo/docs/notes/a%20b%231.html'
// As a session sees them: pretty-printed JSON, then a line of prose.
const TABS_CONTEXT_TEXT = (tabs: { tabId: string; isActive: boolean }[], browserOpen = true) =>
  `${JSON.stringify(
    { browserOpen, tabs: tabs.map(t => ({ tabId: t.tabId, origin: 'http://127.0.0.1:4510', isActive: t.isActive })) },
    null,
    2,
  )}\nThe active tab is the one { your } next call acts on.`
const TABS_CREATE_TEXT = (tabId: string) =>
  `${JSON.stringify({ serverId: 'srv', tabId, reused: false, type: 'browser' }, null, 2)}\nOpened a tab.`

type Opts = {
  pane: boolean
  spawn: 'ok' | 'no-node' | 'dies' | 'exits'
  port?: number
  browserOpen?: boolean
  create?: 'ok' | 'deny'
  context?: 'ok' | 'error' | 'throw'
}
function standIns(on: On, opts: Opts) {
  const seen = { spawns: 0, toasts: [] as string[], logs: [] as string[], tools: [] as Record<string, unknown>[] }
  let tabs: { tabId: string; isActive: boolean }[] = [{ tabId: 'dev', isActive: true }]
  let browserOpen = opts.browserOpen ?? true
  let made = 0
  const addTab = () => {
    const tabId = `r${++made}`
    tabs = [...tabs.map(t => ({ ...t, isActive: false })), { tabId, isActive: true }]
    return tabId
  }
  on('fs.read', (_, e) => ({ value: String(e.path) === WHOLE ? '<!doctype html><html>' : '<article><h1>x</h1></article>' }))
  on('fs.stat', (_, e) => ({ value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false, realPath: String(e.path) } }))
  on('process.spawn', async function* () {
    seen.spawns++
    if (opts.spawn === 'no-node') throw new Error('spawn node ENOENT')
    if (opts.spawn === 'dies') {
      // The kit reads a stream that yields nothing as a wrong answer: say why it died.
      yield { stream: 'stderr' as const, text: 'Error: listen EACCES\n' }
      return { value: { code: 1, signal: null } }
    }
    yield { stream: 'stdout' as const, text: `{"port": ${opts.port ?? 4520}}\n` }
    if (opts.spawn === 'exits') return { value: { code: 0, signal: null } }
    await new Promise(() => {})
    return { value: { code: 0, signal: null } }
  })
  on('ui.toast', (_, e) => { seen.toasts.push(String(e.text)); return { value: undefined } })
  on('ui.log', (_, e) => { seen.logs.push(String(e.text)); return { value: undefined } })
  on('tool.call', (_, e) => {
    seen.tools.push(e)
    if (e.tool.startsWith('mcp__Claude_Browser__') && !opts.pane) return { deny: 'No such tool' }
    if (e.tool === 'mcp__Claude_Browser__tabs_context') {
      if (opts.context === 'error') return { result: {}, isError: true as const }
      if (opts.context === 'throw') throw new Error('the pane broke')
      return { result: {}, text: TABS_CONTEXT_TEXT(tabs, browserOpen) }
    }
    if (e.tool === 'mcp__Claude_Browser__tabs_create') {
      if (opts.create === 'deny') return { deny: 'The browser pane is closed' }
      return { result: {}, text: TABS_CREATE_TEXT(addTab()) }
    }
    if (e.tool === 'mcp__Claude_Browser__tabs_select')
      tabs = tabs.map(t => ({ ...t, isActive: t.tabId === e.tabId }))
    if (e.tool === 'mcp__Claude_Browser__navigate' && e.tabId === undefined) {
      // Navigating with no tab opens the pane in a new, active tab.
      browserOpen = true
      addTab()
    }
    return { result: {} }
  })
  return {
    seen,
    closeTab: (id: string) => { tabs = tabs.filter(t => t.tabId !== id) },
    focusDev: () => { tabs = tabs.map(t => ({ ...t, isActive: t.tabId === 'dev' })) },
  }
}
const write = ($: any, file_path: string) => $.tool.call({ tool: 'Write', file_path, content: 'x' })
const edit = ($: any, file_path: string) => $.tool.call({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b' })
const reader = ($: any, args: string): Promise<{ text?: string }> =>
  $.command.run({
    command: 'reader',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
const of = (seen: { tools: Record<string, unknown>[] }, tool: string) =>
  seen.tools.filter(t => t.tool === `mcp__Claude_Browser__${tool}`)

test('desktop: a spec write starts one server and opens it in a new reader tab', async ($, on) => {
  const { seen } = standIns(on, { pane: true, spawn: 'ok' })
  await write($, DOC); await edit($, DOC)
  await write($, '/repo/src/a.html'); await write($, WHOLE)
  expect(seen.spawns).toBe(1)
  expect(of(seen, 'tabs_create').map(t => t.foreground)).toEqual([true])
  expect(of(seen, 'navigate').map(t => [t.tabId, t.url])).toEqual([['r1', URL1]])
})

test('desktop: a different document navigates the same tab and brings it to the front', async ($, on) => {
  const { seen, focusDev } = standIns(on, { pane: true, spawn: 'ok' })
  await write($, DOC)
  focusDev()
  await write($, DOC2)
  expect(of(seen, 'navigate').map(t => [t.tabId, t.url])).toEqual([['r1', URL1], ['r1', URL2]])
  expect(of(seen, 'tabs_select').map(t => ({ tabId: t.tabId }))).toEqual([{ tabId: 'r1' }])
})

test('desktop: the same document again does not select or navigate', async ($, on) => {
  const { seen, focusDev } = standIns(on, { pane: true, spawn: 'ok' })
  await write($, DOC)
  focusDev()
  await edit($, DOC)
  expect(of(seen, 'navigate').length).toBe(1)
  expect(of(seen, 'tabs_select').length).toBe(0)
})

test('desktop: a closed reader tab is replaced by a new one', async ($, on) => {
  const { seen, closeTab } = standIns(on, { pane: true, spawn: 'ok' })
  await write($, DOC)
  closeTab('r1')
  await write($, DOC2)
  expect(of(seen, 'tabs_create').length).toBe(2)
  expect(of(seen, 'navigate').map(t => [t.tabId, t.url]).at(-1)).toEqual(['r2', URL2])
})

test('desktop: a closed reader tab shows the same document again', async ($, on) => {
  const { seen, closeTab } = standIns(on, { pane: true, spawn: 'ok' })
  await write($, DOC)
  closeTab('r1')
  await edit($, DOC)
  expect(of(seen, 'tabs_create').length).toBe(2)
  expect(of(seen, 'navigate').map(t => [t.tabId, t.url])).toEqual([['r1', URL1], ['r2', URL1]])
})

test('desktop: never navigates a tab it did not open', async ($, on) => {
  const { seen } = standIns(on, { pane: true, spawn: 'ok' })
  await write($, DOC); await write($, DOC2); await write($, DOC)
  const ids = of(seen, 'navigate').map(t => t.tabId)
  expect(ids.length).toBe(3)
  expect(ids.every(id => typeof id === 'string' && id.startsWith('r'))).toBe(true)
  expect(ids.includes('dev')).toBe(false)
  expect(ids.includes(undefined)).toBe(false)
})

test('pane closed: navigate opens it and the active tab becomes the reader tab', async ($, on) => {
  const { seen } = standIns(on, { pane: true, spawn: 'ok', browserOpen: false, create: 'deny' })
  await write($, DOC)
  const first = of(seen, 'navigate')[0]
  expect(first?.tabId).toBe(undefined)
  expect(first?.url).toBe(URL1)
  await write($, DOC2)
  expect(of(seen, 'navigate').map(t => [t.tabId, t.url])).toEqual([[undefined, URL1], ['r1', URL2]])
  expect(of(seen, 'navigate').some(t => t.tabId === 'dev')).toBe(false)
})

test('pane open but no new tab: the dev tab is left alone and the CLI line stands in', async ($, on) => {
  const { seen } = standIns(on, { pane: true, spawn: 'ok', browserOpen: true, create: 'deny' })
  await write($, DOC)
  expect(of(seen, 'navigate').length).toBe(0)
  expect(seen.logs.length).toBe(1)
  expect(seen.logs[0]).toContain(URL1)
})

test('two concurrent first writes start one server', async ($, on) => {
  const { seen } = standIns(on, { pane: true, spawn: 'ok' })
  await Promise.all([write($, DOC), edit($, DOC2)])
  expect(seen.spawns).toBe(1)
})

test('the port the server prints is the one used', async ($, on) => {
  const { seen } = standIns(on, { pane: true, spawn: 'ok', port: 4521 })
  await write($, DOC)
  expect(of(seen, 'navigate').map(t => t.url)).toEqual([
    'http://localhost:4521/s/repo/docs/superpowers/specs/2026-11-20-x-design.html',
  ])
})

test('a refused Write shows nothing', async ($, on) => {
  on('tool.call', { tool: 'Write' }, () => ({ deny: 'no' }))
  const { seen } = standIns(on, { pane: true, spawn: 'ok' })
  await write($, DOC)
  expect(seen.spawns).toBe(0)
  expect(of(seen, 'navigate').length).toBe(0)
})

test('a broken pane never changes the write or its result', async ($, on) => {
  const { seen } = standIns(on, { pane: true, spawn: 'ok', context: 'throw' })
  const ran = await write($, DOC)
  expect(ran).toEqual({ result: {} })
  expect(of(seen, 'navigate').length).toBe(0)
})

test('CLI: one transcript line per document, with its link', async ($, on) => {
  const { seen } = standIns(on, { pane: false, spawn: 'ok' })
  await write($, DOC); await edit($, DOC); await write($, DOC2)
  expect(seen.logs.length).toBe(2)
  expect(seen.logs[0]).toContain(URL1)
  expect(seen.logs[1]).toContain(URL2)
  expect(of(seen, 'navigate').length).toBe(0)
})

test('outcome: Node not on the path gives one notice naming Node and nothing else', async ($, on) => {
  const { seen } = standIns(on, { pane: true, spawn: 'no-node' })
  await write($, DOC); await write($, DOC2)
  expect(seen.spawns).toBe(1)
  expect(seen.toasts.length).toBe(1)
  expect(seen.toasts[0]).toContain('Node')
  expect(of(seen, 'navigate').length).toBe(0)
  expect(seen.logs.length).toBe(0)
})

test('outcome: the server dies without a port: one notice, the next document tries again', async ($, on) => {
  const { seen } = standIns(on, { pane: true, spawn: 'dies' })
  await write($, DOC); await write($, DOC2)
  expect(seen.spawns).toBe(2)
  expect(seen.toasts.length).toBe(1)
  expect(of(seen, 'navigate').length).toBe(0)
})

test('outcome: a server that exits after its port is started again for the next document', async ($, on) => {
  const { seen } = standIns(on, { pane: true, spawn: 'exits' })
  await write($, DOC); await write($, DOC2)
  expect(seen.spawns).toBe(2)
  expect(seen.toasts.length).toBe(0)
  expect(of(seen, 'navigate').map(t => [t.tabId, t.url])).toEqual([['r1', URL1], ['r1', URL2]])
})

test('outcome: a surface with no pane gets the CLI line', async ($, on) => {
  const { seen } = standIns(on, { pane: true, spawn: 'ok', context: 'error' })
  await write($, DOC)
  expect(seen.logs.length).toBe(1)
  expect(seen.logs[0]).toContain(URL1)
  expect(of(seen, 'navigate').length).toBe(0)
})

test('/reader PATH always navigates, even the shown document', async ($, on) => {
  const { seen } = standIns(on, { pane: true, spawn: 'ok' })
  const registered: unknown[] = []
  on('command.register', (_, e) => { registered.push(e); return { value: { command: 'reader' } } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect(registered).toEqual([{
    name: 'reader',
    description: 'Show a spec or plan (.html under docs/) in the reader; no path picks the newest',
    argumentHint: '[path]',
  }])
  await write($, DOC)
  const ran = await reader($, DOC)
  expect(of(seen, 'navigate').length).toBe(2)
  expect(ran.text).toContain(DOC)
})

test('/reader in the CLI answers with the link', async ($, on) => {
  const { seen } = standIns(on, { pane: false, spawn: 'ok' })
  const ran = await reader($, DOC)
  expect(ran.text).toContain(URL1)
  expect(seen.logs.length).toBe(0)
})

test('/reader with no path picks the newest document and skips node_modules and dot-directories', async ($, on) => {
  const dir = (name: string) => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })
  const file = (name: string, mtimeMs: number) => ({ name, kind: 'file' as const, size: 1, mtimeMs, isLink: false })
  const tree: Record<string, FsEntry[]> = {
    '/repo': [dir('docs'), dir('node_modules'), dir('.git')],
    '/repo/docs': [file('old.html', 1), file('new.html', 3), dir('.cache')],
    '/repo/docs/.cache': [file('newer.html', 9)],
    '/repo/.git/docs': [file('newer.html', 9)],
    '/repo/.git': [dir('docs')],
    '/repo/node_modules': [dir('docs')],
    '/repo/node_modules/docs': [file('newer.html', 9)],
  }
  on('fs.list', (_, e) => ({ value: tree[String(e.path)] ?? [] }))
  on('session.cwd', () => ({ value: '/repo' }))
  const { seen } = standIns(on, { pane: true, spawn: 'ok' })
  const ran = await reader($, '')
  const urls = of(seen, 'navigate').map(t => String(t.url))
  expect(urls.length).toBe(1)
  expect(urls[0]?.endsWith('/docs/new.html')).toBe(true)
  expect(ran.text).toBe('Showing /repo/docs/new.html')
})

test('/reader with a non-document path says so', async ($, on) => {
  standIns(on, { pane: true, spawn: 'ok' })
  const ran = await reader($, '/repo/src/a.html')
  expect(ran.text?.startsWith('Not a spec-format document under docs/')).toBe(true)
})
