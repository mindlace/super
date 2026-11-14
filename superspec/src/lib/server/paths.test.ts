import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { assertSpecPath, assertAssetPath } from './paths';

const ROOT = '/tmp/projects-root';
const good = join(ROOT, 'planafoot/docs/superpowers/specs/2026-06-22-x-design.md');
const goodWorktree = join(
  ROOT,
  'planafoot/.claude/worktrees/wt1/docs/superpowers/specs/2026-06-22-y-design.md'
);

describe('assertSpecPath', () => {
  it('accepts a valid main spec path', () => {
    expect(assertSpecPath(good, ROOT)).toBe(good);
  });

  it('accepts a valid worktree spec path', () => {
    expect(assertSpecPath(goodWorktree, ROOT)).toBe(goodWorktree);
  });

  it('accepts an .html spec path', () => {
    const html = join(ROOT, 'planafoot/docs/superpowers/specs/2026-06-22-x-design.html');
    expect(assertSpecPath(html, ROOT)).toBe(html);
  });

  it('rejects an .htm file', () => {
    const htm = join(ROOT, 'p/docs/superpowers/specs/x.htm');
    expect(() => assertSpecPath(htm, ROOT)).toThrow();
  });

  it('rejects a path outside the root', () => {
    expect(() => assertSpecPath('/etc/passwd', ROOT)).toThrow();
  });

  it('rejects traversal escaping the root', () => {
    const evil = join(ROOT, '../../etc/docs/superpowers/specs/x.md');
    expect(() => assertSpecPath(evil, ROOT)).toThrow();
  });

  it('rejects a non-markdown file', () => {
    const txt = join(ROOT, 'p/docs/superpowers/specs/x.txt');
    expect(() => assertSpecPath(txt, ROOT)).toThrow();
  });

  it('rejects a markdown file not under specs', () => {
    const elsewhere = join(ROOT, 'p/README.md');
    expect(() => assertSpecPath(elsewhere, ROOT)).toThrow();
  });

  it('accepts a plans path (any superpowers subdir)', () => {
    const plan = join(ROOT, 'planafoot/docs/superpowers/plans/2026-06-22-x.md');
    expect(assertSpecPath(plan, ROOT)).toBe(plan);
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
    ['html', join(ROOT, 'p/docs/superpowers/specs/assets/x/mock.html')]
  ])('rejects %s', (_n, p) => {
    expect(() => assertAssetPath(p, ROOT)).toThrow();
  });
});
