export type SpecKind = 'markdown' | 'html';

export function specKind(name: string): SpecKind | null {
  if (name.endsWith('.md')) return 'markdown';
  if (name.endsWith('.html')) return 'html';
  return null;
}

export function isSpecFile(name: string): boolean {
  return specKind(name) !== null;
}

export function stripSpecExt(name: string): string {
  return name.replace(/\.(md|html)$/, '');
}
