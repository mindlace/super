import { homedir } from 'node:os';
import { join } from 'node:path';

export const PROJECTS_ROOT = join(homedir(), 'Projects');
export const SPECS_SEGMENT = join('docs', 'superpowers', 'specs');
