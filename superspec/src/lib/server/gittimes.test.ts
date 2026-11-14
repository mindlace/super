import { describe, it, expect } from 'vitest';
import { parseNameStatusLog, listDocTimes, gitTopLevel } from './gittimes';

const SOH = '\x01';

const log = [
  `${SOH}300`,
  '',
  'M\tdocs/superpowers/specs/a.md',
  'R100\tdocs/superpowers/specs/old.md\tdocs/superpowers/specs/new.md',
  `${SOH}250`, // merge commit: no files
  `${SOH}200`,
  '',
  'A\tdocs/superpowers/specs/old.md',
  'D\tdocs/superpowers/specs/gone.md',
  `${SOH}100`,
  '',
  'A\tdocs/superpowers/specs/a.md',
  'A\tdocs/superpowers/specs/gone.md',
  'A\tdocs/superpowers/specs/two words.md',
  'A\tdocs/superpowers/specs/café.md'
].join('\n');

describe('parseNameStatusLog', () => {
  it('created is the adding commit, updated the last commit', () => {
    expect(parseNameStatusLog(log).get('docs/superpowers/specs/a.md')).toEqual({
      created: 100_000,
      updated: 300_000
    });
  });

  it('a rename keeps the original creation time', () => {
    const m = parseNameStatusLog(log);
    expect(m.get('docs/superpowers/specs/new.md')).toEqual({ created: 200_000, updated: 300_000 });
    expect(m.has('docs/superpowers/specs/old.md')).toBe(false);
  });

  it('drops deleted files', () => {
    expect(parseNameStatusLog(log).has('docs/superpowers/specs/gone.md')).toBe(false);
  });

  it('keeps spaces and non-ASCII names intact', () => {
    const m = parseNameStatusLog(log);
    expect(m.get('docs/superpowers/specs/two words.md')?.created).toBe(100_000);
    expect(m.get('docs/superpowers/specs/café.md')?.created).toBe(100_000);
  });

  it('returns an empty map for empty output', () => {
    expect(parseNameStatusLog('').size).toBe(0);
  });
});

describe('listDocTimes', () => {
  it('asks for an unquoted, rename-detecting name-status log of the pathspec', async () => {
    let args: string[] = [];
    await listDocTimes('/r', 'docs/x', async (_r, a) => ((args = a), ''));
    expect(args).toEqual(
      expect.arrayContaining([
        '-c',
        'core.quotePath=false',
        'log',
        '--name-status',
        '-M',
        '--format=%x01%ct'
      ])
    );
    expect(args.at(-1)).toBe('docs/x');
  });

  it('keys by absolute path', async () => {
    const m = await listDocTimes(
      '/r',
      undefined,
      async () => `${SOH}5\n\nA\tdocs/superpowers/specs/a.md`
    );
    expect(m?.get('/r/docs/superpowers/specs/a.md')).toEqual({ created: 5000, updated: 5000 });
  });

  it('returns null when git cannot answer', async () => {
    expect(await listDocTimes('/r', undefined, async () => null)).toBeNull();
  });
});

describe('gitTopLevel', () => {
  it('trims output and passes null through', async () => {
    expect(await gitTopLevel('/r/a', async () => '/r\n')).toBe('/r');
    expect(await gitTopLevel('/r/a', async () => null)).toBeNull();
  });
});
