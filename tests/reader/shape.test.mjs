import { test } from 'node:test'
import assert from 'node:assert/strict'
import { docKind, startsWithArticle, MEDIA_EXT } from '../../plugins/superpowers-reader/reader/shape.mjs'

test('a document anywhere under a docs segment', () => {
  for (const p of ['/p/docs/superpowers/specs/a-design.html', '/p/docs/notes/foo.html',
    '/docs/x.html', '/p/docs/a b#1 é.html', '/p/docs/A.HTML']) assert.equal(docKind(p), 'doc', p)
})
test('media by extension, nothing else', () => {
  assert.deepEqual(MEDIA_EXT, ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm'])
  for (const e of MEDIA_EXT) assert.equal(docKind(`/p/docs/s/assets/x/pic.${e}`), 'media', e)
  for (const e of ['svg', 'js', 'css', 'md', 'mjs', '']) assert.equal(docKind(`/p/docs/pic.${e}`), undefined, e)
})
test('no docs segment', () => {
  for (const p of ['/p/src/a.html', '/p/mydocs/a.html', '/p/docs-old/a.html', '/p/docs.html', '/p/docs'])
    assert.equal(docKind(p), undefined, p)
})
test('relative, dot, empty and NUL segments are refused', () => {
  for (const p of ['docs/a.html', '/p/docs/../a.html', '/p/docs/./a.html', '/p//docs/a.html',
    '/p/docs/.html', '/p/docs/a.html\0', '/p/docs/'])
    assert.equal(docKind(p), undefined, JSON.stringify(p))
})
test('article first, after white space, a BOM and comments', () => {
  for (const t of ['<article>', '  \n<article id="x">', '<!-- c -->\n  <!--d--><article>', '﻿<article>', '<ARTICLE>'])
    assert.equal(startsWithArticle(t), true, t)
  for (const t of ['<!doctype html><article>', '<html>', '<articles>', '', 'text <article>', '<!-- open <article>'])
    assert.equal(startsWithArticle(t), false, t)
})
