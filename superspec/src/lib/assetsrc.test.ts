import { describe, it, expect } from 'vitest';
import { assetSrc } from './assetsrc';

const spec = '/r/p/.claude/worktrees/w/docs/superpowers/specs/2026-11-13-foo-design.html';

describe('assetSrc', () => {
  it('maps a relative path to the asset endpoint', () => {
    expect(assetSrc(spec, 'assets/2026-11-13-foo-design/shot.png')).toBe(
      '/api/asset?path=' +
        encodeURIComponent(
          '/r/p/.claude/worktrees/w/docs/superpowers/specs/assets/2026-11-13-foo-design/shot.png'
        )
    );
    expect(assetSrc(spec, './assets/a/b.mp4')).toContain(
      encodeURIComponent('/specs/assets/a/b.mp4')
    );
  });

  it('rejects schemes, absolute paths and escapes', () => {
    for (const s of [
      'https://x/a.png',
      '//x/a.png',
      '/etc/a.png',
      'data:image/png;base64,AA',
      '../../../../x.png'
    ])
      expect(assetSrc(spec, s)).toBeNull();
  });
});
