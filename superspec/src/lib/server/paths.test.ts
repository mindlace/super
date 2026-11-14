import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { mkdir, realpath, symlink } from 'node:fs/promises';
import { assertDocPathShape, assertAssetPath, locateDoc } from './paths';
import { makeTree } from './testtree';

const ROOT = '/tmp/projects-root';
describe('assertDocPathShape', () => {
  it.each([
    'p/docs/x.md',
    'p/docs/sub/y.html',
    'p/docs/superpowers/specs/z.md',
    'p/.claude/worktrees/wt/docs/x.md',
    'p/.claude/worktrees/support/foo/docs/x.md'
  ])('accepts %s', (rel) => {
    const p = join(ROOT, rel);
    expect(assertDocPathShape(p, ROOT)).toBe(p);
  });

  it.each([
    ['a file outside docs', join(ROOT, 'p/README.md')],
    ['a nested docs dir', join(ROOT, 'p/src/docs/x.md')],
    ['a .txt file', join(ROOT, 'p/docs/x.txt')],
    ['an .htm file', join(ROOT, 'p/docs/x.htm')],
    ['a worktree nested 4 deep', join(ROOT, 'p/.claude/worktrees/a/b/c/d/docs/x.md')],
    ['worktrees/docs with no worktree', join(ROOT, 'p/.claude/worktrees/docs/x.md')],
    ['a path outside the root', '/etc/passwd'],
    ['traversal escaping the root', join(ROOT, '../../etc/docs/x.md')],
    ['the docs dir itself', join(ROOT, 'p/docs')],
    ['a file directly in the root', join(ROOT, 'x.md')],
    ['raw traversal escaping the root', `${ROOT}/p/docs/../../../etc/docs/x.md`],
    ['raw traversal out of docs', `${ROOT}/p/docs/../README.md`]
  ])('rejects %s', (_n, p) => {
    expect(() => assertDocPathShape(p, ROOT)).toThrow();
  });

  it('throws with status 400', () => {
    try {
      assertDocPathShape('/etc/passwd', ROOT);
      expect.unreachable();
    } catch (e) {
      expect((e as { status: number }).status).toBe(400);
    }
  });
});

async function statusOf(p: Promise<unknown>): Promise<number | undefined> {
  try {
    await p;
  } catch (e) {
    return (e as { status?: number }).status;
  }
  return undefined;
}

describe('locateDoc', () => {
  it('returns the lexical path and the real path for a docs file', async () => {
    const r = await makeTree({ 'p/docs/a.md': '# A' });
    const p = join(r, 'p/docs/a.md');
    const got = await locateDoc(p, r);
    expect(got.path).toBe(p);
    expect(got.real).toBe(await realpath(p));
  });

  it('rejects a symlink in docs pointing outside the root', async () => {
    const outside = await makeTree({ 'secret.md': 'nope' });
    const r = await makeTree({ 'p/docs/keep.md': '# K' });
    await symlink(join(outside, 'secret.md'), join(r, 'p/docs/evil.md'));
    expect(await statusOf(locateDoc(join(r, 'p/docs/evil.md'), r))).toBe(400);
  });

  it('rejects a symlinked docs dir pointing outside the root', async () => {
    const outside = await makeTree({ 'stuff/secret.md': 'nope' });
    const r = await makeTree({ 'p/README.md': 'hi' });
    await symlink(join(outside, 'stuff'), join(r, 'p/docs'));
    expect(await statusOf(locateDoc(join(r, 'p/docs/secret.md'), r))).toBe(400);
  });

  it('rejects a symlink in docs pointing at a .txt inside the root', async () => {
    const r = await makeTree({ 'p/docs/notes.txt': 'plain' });
    await symlink(join(r, 'p/docs/notes.txt'), join(r, 'p/docs/sneaky.md'));
    expect(await statusOf(locateDoc(join(r, 'p/docs/sneaky.md'), r))).toBe(400);
  });

  it('404 for a directory named x.md', async () => {
    const r = await makeTree({ 'p/docs/x.md/inner.md': '# I' });
    expect(await statusOf(locateDoc(join(r, 'p/docs/x.md'), r))).toBe(404);
  });

  it('404 for a missing file', async () => {
    const r = await makeTree({ 'p/docs/a.md': '# A' });
    expect(await statusOf(locateDoc(join(r, 'p/docs/missing.md'), r))).toBe(404);
  });

  it('400 for a bad shape before touching the disk', async () => {
    const r = await makeTree({ 'p/README.md': 'hi' });
    expect(await statusOf(locateDoc(join(r, 'p/README.md'), r))).toBe(400);
  });

  it('rejects a worktree-shaped symlink pointing outside the root, without falling back to main', async () => {
    const outside = await makeTree({ 'secret.md': 'nope' });
    const rel = 'docs/superpowers/specs/2026-06-22-a-design.md';
    const r = await makeTree({ [`p/${rel}`]: '# Main' });
    const wt = join(r, 'p/.claude/worktrees/wt', rel);
    await mkdir(dirname(wt), { recursive: true });
    await symlink(join(outside, 'secret.md'), wt);
    expect(await statusOf(locateDoc(wt, r))).toBe(400);
  });

  it('refuses a main fallback that is itself a symlink pointing outside the root', async () => {
    const outside = await makeTree({ 'secret.md': 'nope' });
    const rel = 'docs/superpowers/specs/2026-06-22-b-design.md';
    const r = await makeTree({ 'p/README.md': 'hi' });
    await mkdir(dirname(join(r, 'p', rel)), { recursive: true });
    await symlink(join(outside, 'secret.md'), join(r, 'p', rel));
    const gone = join(r, 'p/.claude/worktrees/wt', rel);
    expect(await statusOf(locateDoc(gone, r))).toBe(400);
  });

  it('falls back to the main copy when the worktree copy is gone', async () => {
    const rel = 'docs/superpowers/specs/2026-06-22-landed-design.md';
    const r = await makeTree({ [`p/${rel}`]: '# Landed' });
    const gone = join(r, 'p/.claude/worktrees/wt/', rel);
    const got = await locateDoc(gone, r);
    expect(got.path).toBe(join(r, 'p', rel));
    expect(got.real).toBe(await realpath(join(r, 'p', rel)));
  });
});

describe('assertAssetPath', () => {
  const ok = join(
    ROOT,
    'p/.claude/worktrees/w/docs/superpowers/specs/assets/2026-11-13-foo-design/shot.png'
  );

  it('accepts assets under <type>/assets/', () => {
    expect(assertAssetPath(ok, ROOT)).toBe(ok);
    expect(
      assertAssetPath(join(ROOT, 'p/docs/superpowers/plans/assets/x/v.webm'), ROOT)
    ).toBeTruthy();
    expect(
      assertAssetPath(join(ROOT, 'p/docs/superpowers/specs/assets/x/SHOT.PNG'), ROOT)
    ).toBeTruthy();
  });

  it.each([
    ['traversal', join(ROOT, 'p/docs/superpowers/specs/assets/../../../../../etc/x.png')],
    ['outside root', '/etc/x.png'],
    ['assets directly under superpowers', join(ROOT, 'p/docs/superpowers/assets/x/a.png')],
    ['not in assets/', join(ROOT, 'p/docs/superpowers/specs/a.png')],
    ['not under docs/superpowers', join(ROOT, 'p/src/assets/a.png')],
    ['svg', join(ROOT, 'p/docs/superpowers/specs/assets/x/a.svg')],
    ['html', join(ROOT, 'p/docs/superpowers/specs/assets/x/mock.html')],
    ['a file named only by its extension', join(ROOT, 'p/docs/superpowers/specs/assets/x/.png')],
    ['a prototype key as extension', join(ROOT, 'p/docs/superpowers/specs/assets/x/a.constructor')]
  ])('rejects %s', (_n, p) => {
    expect(() => assertAssetPath(p, ROOT)).toThrow();
  });
});
