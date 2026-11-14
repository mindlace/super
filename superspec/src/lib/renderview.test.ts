import { describe, expect, it } from 'vitest';
import { renderViewFor } from './renderview';

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
