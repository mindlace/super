import { expect, test } from 'claude-code/testing'
import type { FsEntry, On } from 'claude-code'

const DOC = '/repo/docs/superpowers/specs/2026-11-20-x-design.html'
const DOC2 = '/repo/docs/notes/a b#1.html'
const WHOLE = '/repo/docs/notes/api.html'
const URL1 = 'http://localhost:4520/s/repo/docs/superpowers/specs/2026-11-20-x-design.html'
const URL2 = 'http://localhost:4520/s/repo/docs/notes/a%20b%231.html'
const DOC_X = '/repo/docs/notes/x.html'
const URL_X = 'http://localhost:4520/s/repo/docs/notes/x.html'
const SHOW_PANE = 'mcp__ccd_view__show_pane'
const NOTE = (url: string) =>
  `superpowers-reader: this document is live at ${url} (it refreshes on change). ` +
  'When you name this document to the user or in a report to another agent, give this URL, not the file path.'
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
  // Whether navigating with no tab makes its new tab the active one (default true).
  opensActive?: boolean
  // How mcp__ccd_view__show_pane answers (default 'ok').
  reveal?: 'ok' | 'deny' | 'throw'
}
function standIns(on: On, opts: Opts) {
  const seen = { spawns: 0, toasts: [] as string[], logs: [] as string[], tools: [] as Record<string, unknown>[] }
  let tabs: { tabId: string; isActive: boolean }[] = [{ tabId: 'dev', isActive: true }]
  let browserOpen = opts.browserOpen ?? true
  let made = 0
  const addTab = (isActive = true) => {
    const tabId = `r${++made}`
    tabs = isActive
      ? [...tabs.map(t => ({ ...t, isActive: false })), { tabId, isActive: true }]
      : [...tabs, { tabId, isActive: false }]
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
    if (e.tool === SHOW_PANE) {
      if (opts.reveal === 'deny') return { deny: 'No such tool' }
      if (opts.reveal === 'throw') throw new Error('the view broke')
      return { result: {} }
    }
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
      // Navigating with no tab opens the pane in a new tab, active unless told otherwise.
      browserOpen = true
      addTab(opts.opensActive ?? true)
    }
    return { result: {} }
  })
  return {
    seen,
    closeTab: (id: string) => { tabs = tabs.filter(t => t.tabId !== id) },
    focusDev: () => { tabs = tabs.map(t => ({ ...t, isActive: t.tabId === 'dev' })) },
  }
}
const write = ($: any, file_path: string, agentId?: string) =>
  $.tool.call({ tool: 'Write', file_path, content: 'x', ...(agentId === undefined ? {} : { agentId }) })
const edit = ($: any, file_path: string, agentId?: string) =>
  $.tool.call({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b', ...(agentId === undefined ? {} : { agentId }) })
const report = ($: any, agentId: string, text: string, parentAgentId?: string): Promise<{ text?: string; consumed?: string }> =>
  $.agent.report({
    agentId,
    ...(parentAgentId === undefined ? {} : { parentAgentId }),
    subagentType: 'plan-drafter',
    provider: { plugin: 'engine', tier: 'core' },
    status: 'completed',
    text,
  })
// Stands in for core beneath agent.report: delivers the text as given.
const reportBottom = (on: On) => on('agent.report', (_, e) => ({ text: e.text, review: 'off' as const }))
const reader = ($: any, args: string): Promise<{ text?: string }> =>
  $.command.run({
    command: 'reader',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
const of = (seen: { tools: Record<string, unknown>[] }, tool: string) =>
  seen.tools.filter(t => t.tool === `mcp__Claude_Browser__${tool}`)
const reveals = (seen: { tools: Record<string, unknown>[] }) => seen.tools.filter(t => t.tool === SHOW_PANE)

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

test('desktop: each different document reveals the browser pane once', async ($, on) => {
  const { seen } = standIns(on, { pane: true, spawn: 'ok' })
  await write($, DOC)
  expect(reveals(seen).map(t => [t.tool, t.pane])).toEqual([[SHOW_PANE, 'preview']])
  await write($, DOC2)
  expect(reveals(seen).length).toBe(2)
  expect(reveals(seen).every(t => t.pane === 'preview')).toBe(true)
})

test('desktop: an edit of the shown document does not reveal the pane', async ($, on) => {
  const { seen } = standIns(on, { pane: true, spawn: 'ok' })
  await write($, DOC)
  await edit($, DOC); await edit($, DOC)
  expect(reveals(seen).length).toBe(1)
})

for (const reveal of ['deny', 'throw'] as const) {
  test(`desktop: a reveal that answers ${reveal} changes nothing`, async ($, on) => {
    const { seen } = standIns(on, { pane: true, spawn: 'ok', reveal })
    const ran = await write($, DOC)
    expect(ran).toEqual({ result: {}, context: [NOTE(URL1)] })
    // Still counted as shown: no transcript line, and an edit does not navigate again.
    await edit($, DOC)
    expect(seen.logs.length).toBe(0)
    expect(of(seen, 'navigate').length).toBe(1)
    expect(reveals(seen).length).toBe(1)
  })
}

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

test('pane closed: a tab that was already there is never adopted, even when it stays active', async ($, on) => {
  const { seen } = standIns(on, { pane: true, spawn: 'ok', browserOpen: false, create: 'deny', opensActive: false })
  await write($, DOC)
  await write($, DOC2)
  const navigated = of(seen, 'navigate').map(t => [t.tabId, t.url])
  expect(navigated[0]).toEqual([undefined, URL1])
  expect(navigated.some(([tabId]) => tabId === 'dev')).toBe(false)
  // The tab the open made is the one adopted: the next document goes there.
  expect(navigated).toEqual([[undefined, URL1], ['r1', URL2]])
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
  expect(of(seen, 'tabs_create').length).toBe(1)
  const ids = of(seen, 'navigate').map(t => t.tabId)
  expect(ids.length).toBe(2)
  expect(ids.every(id => id === 'r1')).toBe(true)
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
  // The result is untouched; the link the CLI line gives is added for the model.
  expect(ran).toEqual({ result: {}, context: [NOTE(URL1)] })
  expect(of(seen, 'navigate').length).toBe(0)
})

test('CLI: one transcript line per document, with its link', async ($, on) => {
  const { seen } = standIns(on, { pane: false, spawn: 'ok' })
  await write($, DOC); await edit($, DOC); await write($, DOC2)
  expect(seen.logs.length).toBe(2)
  expect(seen.logs[0]).toContain(URL1)
  expect(seen.logs[1]).toContain(URL2)
  expect(of(seen, 'navigate').length).toBe(0)
  expect(reveals(seen).length).toBe(0)
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

test('outcome: a server that exits after its port: one notice, started again for the next document', async ($, on) => {
  const { seen } = standIns(on, { pane: true, spawn: 'exits' })
  await write($, DOC); await write($, DOC2)
  expect(seen.spawns).toBe(2)
  expect(seen.toasts.length).toBe(1)
  expect(seen.toasts[0]).toContain('server')
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

test('paths are normalised: ./, /./, // and .. resolve to the plain path', async ($, on) => {
  on('session.cwd', () => ({ value: '/repo' }))
  const { seen } = standIns(on, { pane: true, spawn: 'ok' })
  await write($, '/repo/docs/./notes/x.html')
  expect(of(seen, 'navigate').map(t => t.url)).toEqual([URL_X])
  // The same document by other spellings: the URL is unchanged, so nothing navigates.
  await edit($, '/repo//docs/notes/x.html')
  await edit($, '/repo/src/../docs/notes/../notes/x.html')
  expect(of(seen, 'navigate').map(t => t.url)).toEqual([URL_X])
  const ran = await reader($, './docs/notes/x.html')
  expect(ran.text).toBe(`Showing ${DOC_X}`)
  expect(of(seen, 'navigate').map(t => t.url)).toEqual([URL_X, URL_X])
})

test('a path that climbs out of docs with .. is normalised before the shape check', async ($, on) => {
  on('session.cwd', () => ({ value: '/repo' }))
  const { seen } = standIns(on, { pane: true, spawn: 'ok' })
  await write($, '/repo/docs/notes/../../src/a.html')
  expect(seen.spawns).toBe(0)
  const ran = await reader($, 'docs/../src/a.html')
  expect(ran.text).toBe('Not a spec-format document under docs/: /repo/src/a.html')
})

test('the model is told the link on every write and edit of a document shown in the pane', async ($, on) => {
  standIns(on, { pane: true, spawn: 'ok' })
  expect(await write($, DOC)).toEqual({ result: {}, context: [NOTE(URL1)] })
  expect(await edit($, DOC)).toEqual({ result: {}, context: [NOTE(URL1)] })
  expect(await edit($, DOC2)).toEqual({ result: {}, context: [NOTE(URL2)] })
})

test('CLI: the model is told the link on every write and edit, not only with the first line', async ($, on) => {
  const { seen } = standIns(on, { pane: false, spawn: 'ok' })
  expect(await write($, DOC)).toEqual({ result: {}, context: [NOTE(URL1)] })
  expect(await edit($, DOC)).toEqual({ result: {}, context: [NOTE(URL1)] })
  expect(seen.logs.length).toBe(1)
})

test('the link note goes after any context from beneath', async ($, on) => {
  on('tool.call', { tool: 'Write' }, () => ({ result: {}, context: ['beneath'] }))
  standIns(on, { pane: false, spawn: 'ok' })
  expect(await write($, DOC)).toEqual({ result: {}, context: ['beneath', NOTE(URL1)] })
})

test('a write that is not a document, or that errored, is returned untouched', async ($, on) => {
  standIns(on, { pane: true, spawn: 'ok' })
  expect(await write($, '/repo/src/a.html')).toEqual({ result: {} })
  expect(await write($, WHOLE)).toEqual({ result: {} })
})

test('an errored Write is returned untouched and shows nothing', async ($, on) => {
  on('tool.call', { tool: 'Write' }, () => ({ result: 'boom', isError: true as const, text: 'boom' }))
  const { seen } = standIns(on, { pane: true, spawn: 'ok' })
  expect(await write($, DOC)).toEqual({ result: 'boom', isError: true, text: 'boom' })
  expect(seen.spawns).toBe(0)
})

for (const spawn of ['no-node', 'dies'] as const) {
  test(`fail open: with no server (${spawn}) the result is untouched`, async ($, on) => {
    standIns(on, { pane: true, spawn })
    expect(await write($, DOC)).toEqual({ result: {} })
  })
}

test('subagent: the report it hands back carries the links of the documents it wrote', async ($, on) => {
  reportBottom(on)
  standIns(on, { pane: false, spawn: 'ok' })
  expect(await write($, DOC, 'a1')).toEqual({ result: {}, context: [NOTE(URL1)] })
  await edit($, DOC, 'a1'); await write($, DOC2, 'a1')
  const ran = await report($, 'a1', 'Plan written to docs/superpowers/specs/2026-11-20-x-design.html.')
  expect(ran.text).toBe(
    'Plan written to docs/superpowers/specs/2026-11-20-x-design.html.\n\n' +
      'superpowers-reader: documents this agent wrote are live (they refresh on change); ' +
      'give these URLs, not file paths, when naming them to the user or in a report:\n' +
      `- 2026-11-20-x-design.html: ${URL1}\n` +
      `- a b#1.html: ${URL2}`,
  )
  // Handed over once: a later report of the same agent adds nothing.
  expect((await report($, 'a1', 'again')).text).toBe('again')
})

test('subagent: a report that already gives every link is left as it is', async ($, on) => {
  reportBottom(on)
  standIns(on, { pane: false, spawn: 'ok' })
  await write($, DOC, 'a1')
  const text = `The plan is live at ${URL1}`
  expect((await report($, 'a1', text)).text).toBe(text)
})

test('subagent: only its own documents, and none for the main conversation or an agent that wrote none', async ($, on) => {
  reportBottom(on)
  standIns(on, { pane: false, spawn: 'ok' })
  await write($, DOC)
  await write($, DOC2, 'a2')
  expect((await report($, 'a1', 'done')).text).toBe('done')
  const ran = await report($, 'a2', 'done')
  expect(ran.text?.includes(URL2)).toBe(true)
  expect(ran.text?.includes(URL1)).toBe(false)
})

test('subagent: a nested agent\'s links reach its parent\'s report too', async ($, on) => {
  reportBottom(on)
  standIns(on, { pane: false, spawn: 'ok' })
  await write($, DOC, 'child')
  expect((await report($, 'child', 'child done', 'parent')).text?.includes(URL1)).toBe(true)
  expect((await report($, 'parent', 'parent done')).text?.includes(URL1)).toBe(true)
})

test('subagent: a consumed report stays consumed', async ($, on) => {
  on('agent.report', () => ({ consumed: 'kept' }))
  standIns(on, { pane: false, spawn: 'ok' })
  await write($, DOC, 'a1')
  expect(await report($, 'a1', 'done')).toEqual({ consumed: 'kept' })
})
