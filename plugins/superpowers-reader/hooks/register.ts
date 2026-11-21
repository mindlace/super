import type { EngineInterface, Register } from 'claude-code'
// @ts-ignore TS7016: shape.mjs is the server's plain JavaScript (typed by JSDoc), with no .d.ts
import { docKind as kindOf, startsWithArticle as isArticle } from '../reader/shape.mjs'

const docKind: (path: string) => 'doc' | 'media' | undefined = kindOf
const startsWithArticle: (text: string) => boolean = isArticle

// After a Write or Edit of a spec-format .html under a docs/ directory, start
// the reader's server once per session and show the document: in the desktop
// app, in a browser-pane tab this module opened; elsewhere, as one transcript
// line with its link. Every failure leaves the write as it was.

const NODE_NOTICE = 'superpowers-reader needs Node on the PATH to show documents.'
const SERVER_NOTICE = 'superpowers-reader could not start its server. The next document will try again.'
const START_TIMEOUT_MS = 8_000 // under the 10 s hook budget, so this timeout decides
const MAX_DEPTH = 8
const BROWSER = 'mcp__Claude_Browser__'

// Module state, lost on a reload (which costs one more server and one more tab).
let server: Promise<number | undefined> | undefined // the port, shared by concurrent callers
let isNodeMissing = false // set on spawn failure; stops all further work
let hasWarnedServer = false // one server notice per session
let readerTab: string | undefined // the pane tab this module opened
let shownUrl = '' // the URL last navigated in readerTab
const logged = new Set<string>() // paths given a CLI transcript line
let paneTurn: Promise<unknown> = Promise.resolve() // one pane conversation at a time

type Tab = { tabId: string; isActive: boolean }
type PaneContext = { browserOpen: boolean; tabs: Tab[] }
type Ran = { deny?: string; isError?: true; text?: string; result?: unknown }

function docUrl(port: number, path: string): string {
  return `http://localhost:${port}/s${path.split('/').map(encodeURIComponent).join('/')}`
}

// POSIX-normalises an absolute path: drops empty and `.` segments, resolves `..`.
function normalise(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }

  return `/${parts.join('/')}`
}

async function absolute($: EngineInterface, path: string): Promise<string> {
  return normalise(path.startsWith('/') ? path : `${await $.session.cwd()}/${path}`)
}

async function isDocument($: EngineInterface, path: string): Promise<boolean> {
  try {
    if (docKind(path) !== 'doc') return false
    const { realPath } = await $.fs.stat(path, { resolve: true })
    if (realPath === undefined || docKind(realPath) !== 'doc') return false
    const text = await $.fs.read(path)

    return typeof text === 'string' && startsWithArticle(text)
  } catch {
    return false
  }
}

function warnServer($: EngineInterface): void {
  if (hasWarnedServer) return
  hasWarnedServer = true
  $.ui.toast(SERVER_NOTICE)
}

function parsePort(line: string): number | undefined {
  try {
    const port: unknown = JSON.parse(line).port

    return typeof port === 'number' && Number.isInteger(port) && port > 0 && port < 65536 ? port : undefined
  } catch {
    return undefined
  }
}

// Starts `node reader/server.mjs` in a loop that runs on for the session's life
// (leaving the loop kills the child) and resolves the port from its first line.
function startServer($: EngineInterface): Promise<number | undefined> {
  const started = new Promise<number | undefined>(resolve => {
    let isSettled = false
    let hasPort = false
    const timer = new AbortController()
    const settle = (port: number | undefined) => {
      if (isSettled) return
      isSettled = true
      timer.abort()
      resolve(port)
    }
    const fail = () => {
      if (isSettled) return
      if (server === started) server = undefined
      settle(undefined)
      warnServer($)
    }
    const child = $.process.spawn({ argv: ['node', `${$.plugin.root}/reader/server.mjs`] })
    $.clock.sleep(START_TIMEOUT_MS, { signal: timer.signal }).then(
      () => {
        if (isSettled) return
        fail()
        void child.return({ code: null, signal: null }).catch(() => {})
      },
      () => {}, // aborted, or no clock: the loop decides alone
    )
    void (async () => {
      let hasPulled = false
      let buffer = ''
      try {
        for await (const { stream, text } of child) {
          hasPulled = true
          if (isSettled || stream !== 'stdout') continue
          buffer += text
          const end = buffer.indexOf('\n')
          if (end < 0) continue
          const port = parsePort(buffer.slice(0, end))
          if (port === undefined) break // a bad first line: leaving the loop ends the child
          hasPort = true
          settle(port)
        }
      } catch {
        if (!hasPulled && !isSettled) {
          // The first pull rejects only when `node` cannot start.
          isNodeMissing = true
          if (server === started) server = undefined
          settle(undefined)
          $.ui.toast(NODE_NOTICE)

          return
        }
      }
      if (hasPort) {
        // The child exited after printing its port: one notice per session, and
        // the next document starts another.
        if (server === started) {
          server = undefined
          shownUrl = ''
        }
        warnServer($)

        return
      }
      fail()
    })()
  })

  return started
}

function ensureServer($: EngineInterface): Promise<number | undefined> {
  if (isNodeMissing) return Promise.resolve(undefined)
  if (server === undefined) server = startServer($)

  return server
}

// The first JSON object in a tool's answer text, which may carry prose after it.
function firstJson(text: string): Record<string, unknown> | undefined {
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    let depth = 0
    let inString = false
    for (let i = start; i < text.length; i++) {
      const c = text[i]
      if (inString) {
        if (c === '\\') i++
        else if (c === '"') inString = false
      } else if (c === '"') inString = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        try {
          const value: unknown = JSON.parse(text.slice(start, i + 1))
          if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            return value as Record<string, unknown>
          }
        } catch {
          // not JSON from here: try the next brace
        }
        break
      }
    }
  }

  return undefined
}

// What a tool answered, as text: core's `text`, else any text the result holds.
function answerText(ran: Ran): string {
  if (typeof ran.text === 'string') return ran.text
  const result = ran.result
  if (typeof result === 'string') return result
  if (result !== null && typeof result === 'object') {
    const content = (result as { content?: unknown }).content
    if (Array.isArray(content)) {
      return content
        .map(block => (block !== null && typeof block === 'object' && typeof block.text === 'string' ? block.text : ''))
        .join('\n')
    }
    try {
      return JSON.stringify(result)
    } catch {
      return ''
    }
  }

  return ''
}

async function browser($: EngineInterface, tool: string, input: Record<string, unknown>): Promise<Ran | undefined> {
  try {
    const ran = (await $.tool.call({ tool: `${BROWSER}${tool}`, ...input } as never)) as Ran
    if (ran.deny !== undefined || ran.isError === true) return undefined

    return ran
  } catch {
    return undefined
  }
}

async function paneContext($: EngineInterface): Promise<PaneContext | undefined> {
  const ran = await browser($, 'tabs_context', {})
  if (ran === undefined) return undefined
  const parsed = firstJson(answerText(ran))
  if (parsed === undefined || !Array.isArray(parsed.tabs)) return undefined
  const tabs: Tab[] = []
  for (const tab of parsed.tabs as unknown[]) {
    if (tab !== null && typeof tab === 'object' && typeof (tab as Tab).tabId === 'string') {
      tabs.push({ tabId: (tab as Tab).tabId, isActive: (tab as Tab).isActive === true })
    }
  }

  return { browserOpen: parsed.browserOpen !== false, tabs }
}

async function showInPaneNow($: EngineInterface, url: string, isForced: boolean): Promise<'shown' | 'same' | 'no-pane'> {
  const context = await paneContext($)
  if (context === undefined) return 'no-pane'
  const listed = context.tabs.find(tab => tab.tabId === readerTab)
  if (listed !== undefined) {
    if (!isForced && url === shownUrl) return 'same'
    if ((await browser($, 'navigate', { tabId: listed.tabId, url })) === undefined) return 'no-pane'
    shownUrl = url
    if (!listed.isActive) await browser($, 'tabs_select', { tabId: listed.tabId })

    return 'shown'
  }
  // The reader's tab is gone (or was never opened): open a new one.
  readerTab = undefined
  shownUrl = ''
  const created = await browser($, 'tabs_create', { foreground: true })
  const tabId = created === undefined ? undefined : firstJson(answerText(created))?.tabId
  if (typeof tabId === 'string' && tabId !== '') {
    readerTab = tabId
    if ((await browser($, 'navigate', { tabId, url })) === undefined) return 'no-pane'
    shownUrl = url

    return 'shown'
  }
  // Only a closed pane may be navigated without a tab: that opens it in a new
  // tab, which becomes the reader's. An open pane's tabs are never touched.
  if (context.browserOpen) return 'no-pane'
  if ((await browser($, 'navigate', { url })) === undefined) return 'no-pane'
  // Adopt only a tab the open made: one not listed before it, the active one
  // first. With none, the next document tries a new tab again.
  const before = new Set(context.tabs.map(tab => tab.tabId))
  const made = (await paneContext($))?.tabs.filter(tab => !before.has(tab.tabId)) ?? []
  const adopted = made.find(tab => tab.isActive) ?? made[0]
  if (adopted !== undefined) {
    readerTab = adopted.tabId
    shownUrl = url
  }

  return 'shown'
}

// Reveals the desktop app's Browser pane. Any failure, deny or missing tool is ignored.
async function revealPane($: EngineInterface): Promise<void> {
  try {
    await $.tool.call({ tool: 'mcp__ccd_view__show_pane', pane: 'preview' } as never)
  } catch {
    // ignored: the document is shown either way
  }
}

async function showAndReveal($: EngineInterface, url: string, isForced: boolean): Promise<'shown' | 'same' | 'no-pane'> {
  const shown = await showInPaneNow($, url, isForced)
  if (shown === 'shown') await revealPane($)

  return shown
}

function showInPane($: EngineInterface, url: string, isForced: boolean): Promise<'shown' | 'same' | 'no-pane'> {
  const turn = paneTurn.then(() => showAndReveal($, url, isForced))
  paneTurn = turn.catch(() => {})

  return turn
}

async function show(
  $: EngineInterface,
  path: string,
  origin: 'write' | 'command',
): Promise<{ url?: string; where: 'pane' | 'line' | 'none' }> {
  if (isNodeMissing || !(await isDocument($, path))) return { where: 'none' }
  const port = await ensureServer($)
  if (port === undefined) return { where: 'none' }
  const url = docUrl(port, path)
  const shown = await showInPane($, url, origin === 'command').catch(() => 'no-pane' as const)
  if (shown !== 'no-pane') return { url, where: 'pane' }
  if (origin === 'write' && !logged.has(path)) {
    logged.add(path)
    $.ui.log(`superpowers-reader: ${path.slice(path.lastIndexOf('/') + 1)} ${url}`)
  }

  return { url, where: 'line' }
}

async function newestDoc($: EngineInterface): Promise<string | undefined> {
  const found: { path: string; mtimeMs: number }[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    const entries = await $.fs.list(dir).catch(() => [])
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const path = `${dir === '/' ? '' : dir}/${entry.name}`
      if (entry.kind === 'dir' && depth < MAX_DEPTH) await walk(path, depth + 1)
      else if (entry.kind === 'file' && entry.name.endsWith('.html') && docKind(path) === 'doc') {
        found.push({ path, mtimeMs: entry.mtimeMs })
      }
    }
  }
  await walk((await $.session.cwd()).replace(/(.)\/$/, '$1'), 1)
  found.sort((a, b) => b.mtimeMs - a.mtimeMs)
  for (const { path } of found) {
    if (await isDocument($, path)) return path
  }

  return undefined
}

async function onWritten($: EngineInterface, given: string): Promise<void> {
  if (typeof given !== 'string' || given === '') return
  await show($, await absolute($, given), 'write')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command
      .register({
        name: 'reader',
        description: 'Show a spec or plan (.html under docs/) in the reader; no path picks the newest',
        argumentHint: '[path]',
      })
      .catch(() => {})

    return next(e)
  })

  on('command.run', { command: 'reader' }, async ($, e) => {
    const given = e.args.trim()
    const path = given === '' ? await newestDoc($) : await absolute($, given)
    if (path === undefined) return { text: 'No spec-format .html document under a docs/ directory here.' }
    if (!(await isDocument($, path))) return { text: `Not a spec-format document under docs/: ${path}` }
    const shown = await show($, path, 'command')
    if (shown.where === 'none' || shown.url === undefined) {
      return { text: isNodeMissing ? NODE_NOTICE : SERVER_NOTICE }
    }
    if (shown.where === 'pane') return { text: `Showing ${path}` }

    return { text: `${path}: ${shown.url}` }
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await onWritten($, e.file_path).catch(() => {})

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await onWritten($, e.file_path).catch(() => {})

    return ran
  }).catch(($, e, next) => next(e))
}
