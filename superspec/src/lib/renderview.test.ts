import { describe, expect, it } from 'vitest';
import { noticeSummary, renderViewFor } from './renderview';

describe('renderViewFor', () => {
  it('is pending before any render has landed', () => {
    expect(renderViewFor(null, '/a.html')).toEqual({ status: 'pending' });
  });

  it('shows the landed render for the selected path', () => {
    expect(renderViewFor({ path: '/a.html', result: 'A' }, '/a.html')).toEqual({
      status: 'ready',
      result: 'A'
    });
  });

  it("never shows another file's render under a newly selected path", () => {
    expect(renderViewFor({ path: '/a.html', result: 'A' }, '/b.html')).toEqual({
      status: 'pending'
    });
  });

  it('shows the error of a failed render for the selected path', () => {
    expect(renderViewFor({ path: '/a.html', error: 'boom' }, '/a.html')).toEqual({
      status: 'error',
      message: 'boom'
    });
  });

  it("does not show another file's error under a newly selected path", () => {
    expect(renderViewFor({ path: '/a.html', error: 'boom' }, '/b.html')).toEqual({
      status: 'pending'
    });
  });
});

describe('noticeSummary', () => {
  it('joins the parts with a comma and a space', () => {
    expect(noticeSummary(['<span>', '<font>'], [])).toBe('Removed <span>, <font>');
    expect(noticeSummary(['<span>'], ['p1', 'p2'])).toBe('Removed <span>, 2 problems');
    expect(noticeSummary([], ['p1'])).toBe('1 problem');
  });

  it('counts removed markup when naming it would be long', () => {
    expect(noticeSummary(['<span>', '<font>', '<blink>', '<marquee>'], [])).toBe('4 removed');
    expect(noticeSummary(['<custom-element-with-long-name>'], [])).toBe('1 removed');
  });
});
