/** Media extensions the reader serves from a docs tree. */
export const MEDIA_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm']

const DOCS = 'docs'

/**
 * Classify an already decoded, absolute path.
 * 'doc' for name.html and 'media' for name.<MEDIA_EXT> when some directory segment
 * (not the final one) is named exactly `docs`. Anything else is undefined.
 * Extensions compare case-insensitively. Pure: no imports, no file system.
 * @param {string} path
 * @returns {'doc' | 'media' | undefined}
 */
export function docKind(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('\0')) return undefined
  const segments = path.split('/').slice(1)
  if (segments.length === 0) return undefined
  for (const seg of segments) {
    if (seg === '' || seg === '.' || seg === '..') return undefined
  }
  const last = segments.length - 1
  const hasDocsDir = segments.some((seg, i) => i < last && seg === DOCS)
  if (!hasDocsDir) return undefined
  const name = segments[last]
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return undefined
  const ext = name.slice(dot + 1).toLowerCase()
  if (ext === 'html') return 'doc'
  if (MEDIA_EXT.includes(ext)) return 'media'
  return undefined
}

/**
 * True when the first element, after white space, a BOM and HTML comments, is <article>.
 * @param {string} text
 * @returns {boolean}
 */
export function startsWithArticle(text) {
  if (typeof text !== 'string') return false
  let s = text.startsWith('﻿') ? text.slice(1) : text
  for (;;) {
    s = s.replace(/^\s+/, '')
    if (!s.startsWith('<!--')) break
    const end = s.indexOf('-->', 4)
    if (end < 0) return false
    s = s.slice(end + 3)
  }
  return /^<article(?=[\s/>])/i.test(s)
}
