import { resolve, sep } from 'node:path';
import { PROJECTS_ROOT, SUPERPOWERS_SEGMENT } from './config';
import { isSpecFile } from '../specfile';

function bad(message: string): never {
  const err = new Error(message) as Error & { status: number };
  err.status = 400;
  throw err;
}

export function assertSpecPath(p: string, root: string = PROJECTS_ROOT): string {
  const resolved = resolve(p);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    bad(`path is outside the projects root: ${p}`);
  }
  if (!resolved.includes(sep + SUPERPOWERS_SEGMENT + sep)) {
    bad(`path is not inside a docs/superpowers directory: ${p}`);
  }
  if (!isSpecFile(resolved)) {
    bad(`path is not a spec file (.md or .html): ${p}`);
  }
  return resolved;
}
