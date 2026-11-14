import { describe, it, expect } from 'vitest';
import { parseRange, ASSET_TYPES, assetType } from './assets';

describe('assetType', () => {
  it('maps a served extension to its content type, any case', () => {
    expect(assetType('/a/b/shot.png')).toBe('image/png');
    expect(assetType('/a/b/SHOT.JPG')).toBe('image/jpeg');
    expect(assetType('/a/b.c/clip.webm')).toBe('video/webm');
  });

  it('is null for anything else', () => {
    for (const p of ['/a/.png', '/a/png', '/a/b.png/x', '/a/x.svg', '/a/x.toString', '/a/x.'])
      expect(assetType(p)).toBeNull();
  });
});

describe('ASSET_TYPES', () => {
  it('lists exactly the served extensions', () => {
    expect(Object.keys(ASSET_TYPES).sort()).toEqual([
      'gif',
      'jpeg',
      'jpg',
      'mp4',
      'png',
      'webm',
      'webp'
    ]);
    expect(ASSET_TYPES.jpg).toBe('image/jpeg');
    expect(ASSET_TYPES.webm).toBe('video/webm');
  });
});

describe('parseRange', () => {
  it('returns null without a header', () => {
    expect(parseRange(null, 100)).toBeNull();
  });
  it('parses closed, open-ended and suffix ranges', () => {
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
  });
  it('clamps the end to the file size', () => {
    expect(parseRange('bytes=95-200', 100)).toEqual({ start: 95, end: 99 });
  });
  it('flags unsatisfiable ranges', () => {
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable');
  });
  it('ignores multi-range and malformed headers', () => {
    expect(parseRange('bytes=0-1,5-6', 100)).toBeNull();
    expect(parseRange('items=0-1', 100)).toBeNull();
    expect(parseRange('bytes=5-2', 100)).toBeNull();
  });
});
