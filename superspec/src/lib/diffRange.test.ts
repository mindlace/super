import { describe, it, expect } from 'vitest';
import { diffRange } from './diffRange';

// Applying the returned change to `current` must reproduce `incoming`.
function apply(current: string, change: { from: number; to: number; insert: string }) {
  return current.slice(0, change.from) + change.insert + current.slice(change.to);
}

describe('diffRange', () => {
  it('returns a no-op for identical strings', () => {
    const change = diffRange('hello', 'hello');
    expect(change.insert).toBe('');
    expect(change.from).toBe(change.to);
    expect(apply('hello', change)).toBe('hello');
  });

  it('handles a pure append (touches only the tail)', () => {
    const change = diffRange('abc', 'abcdef');
    expect(change).toEqual({ from: 3, to: 3, insert: 'def' });
    expect(apply('abc', change)).toBe('abcdef');
  });

  it('handles a pure prepend (touches only the head)', () => {
    const change = diffRange('def', 'abcdef');
    expect(change).toEqual({ from: 0, to: 0, insert: 'abc' });
    expect(apply('def', change)).toBe('abcdef');
  });

  it('handles a mid-string replacement', () => {
    const change = diffRange('abXcd', 'abYcd');
    expect(change).toEqual({ from: 2, to: 3, insert: 'Y' });
    expect(apply('abXcd', change)).toBe('abYcd');
  });

  it('handles a deletion in the middle', () => {
    const change = diffRange('a-BIG-z', 'a-z');
    expect(apply('a-BIG-z', change)).toBe('a-z');
    // Only the differing middle is touched; the shared "a-" / "-z" stay put.
    expect(change.from).toBe(2);
    expect(change.to).toBe(6);
  });

  it('does not let prefix and suffix overlap on repeated chars', () => {
    // current "aaa" -> incoming "aaaa": prefix would greedily eat everything;
    // the suffix scan must stop so from <= to and the result still applies.
    const change = diffRange('aaa', 'aaaa');
    expect(change.from).toBeLessThanOrEqual(change.to);
    expect(apply('aaa', change)).toBe('aaaa');
  });

  it('replaces fully when nothing is shared', () => {
    const change = diffRange('abc', 'xyz');
    expect(change).toEqual({ from: 0, to: 3, insert: 'xyz' });
    expect(apply('abc', change)).toBe('xyz');
  });
});
