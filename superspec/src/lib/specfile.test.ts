import { describe, it, expect } from 'vitest';
import { isSpecFile, specKind, stripSpecExt } from './specfile';

describe('specfile', () => {
  it('isSpecFile accepts .md and .html only', () => {
    expect(isSpecFile('a.md')).toBe(true);
    expect(isSpecFile('a.html')).toBe(true);
    expect(isSpecFile('a.htm')).toBe(false);
    expect(isSpecFile('a.md.txt')).toBe(false);
  });
  it('specKind maps extension to kind', () => {
    expect(specKind('x.html')).toBe('html');
    expect(specKind('x.md')).toBe('markdown');
    expect(specKind('x.png')).toBeNull();
  });
  it('stripSpecExt removes one trailing spec extension', () => {
    expect(stripSpecExt('2026-11-13-foo-design.html')).toBe('2026-11-13-foo-design');
    expect(stripSpecExt('foo.md')).toBe('foo');
    expect(stripSpecExt('foo.png')).toBe('foo.png');
  });
});
