import type { SpecEntry } from '$lib/types';
import { stripSpecExt } from './specfile';

export interface DisplayGroup {
  parent: SpecEntry;
  children: SpecEntry[];
  /** the parent's created: a plan's activity never reorders groups */
  created: number;
  /** max updated over parent and children: drives the visibility window */
  updated: number;
}

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}(?:-\d{4})?-/;

export function normalizedSlug(filename: string): string {
  return stripSpecExt(filename)
    .replace(DATE_PREFIX, '')
    .replace(/-design$/, '')
    .toLowerCase();
}

function pairKey(e: SpecEntry): string {
  return `${e.project}::${normalizedSlug(e.filename)}`;
}

export function soloGroup(e: SpecEntry): DisplayGroup {
  return { parent: e, children: [], created: e.created, updated: e.updated };
}

/** Newest-created first; parent path keeps equal times in a stable order. */
export function byCreatedDesc(a: DisplayGroup, b: DisplayGroup): number {
  return b.created - a.created || a.parent.path.localeCompare(b.parent.path);
}

export function pairAndGroup(specs: SpecEntry[]): DisplayGroup[] {
  const parents: SpecEntry[] = [];
  const plans: SpecEntry[] = [];
  const others: SpecEntry[] = [];
  for (const e of specs) {
    if (e.type === 'spec') parents.push(e);
    else if (e.type === 'plan') plans.push(e);
    else others.push(e);
  }

  // Index specs by pair key and by title; newest spec wins on collision.
  const keyToSpec = new Map<string, SpecEntry>();
  const titleToSpec = new Map<string, SpecEntry>();
  const indexNewest = (map: Map<string, SpecEntry>, k: string, e: SpecEntry) => {
    const cur = map.get(k);
    if (!cur || e.created > cur.created || (e.created === cur.created && e.updated > cur.updated)) map.set(k, e);
  };
  for (const s of parents) {
    indexNewest(keyToSpec, pairKey(s), s);
    indexNewest(titleToSpec, `${s.project}::${s.title}`, s);
  }

  const childrenBySpec = new Map<SpecEntry, SpecEntry[]>();
  const standalonePlans: SpecEntry[] = [];
  for (const p of plans) {
    const match = keyToSpec.get(pairKey(p)) ?? titleToSpec.get(`${p.project}::${p.title}`);
    if (match) {
      const arr = childrenBySpec.get(match) ?? [];
      arr.push(p);
      childrenBySpec.set(match, arr);
    } else {
      standalonePlans.push(p);
    }
  }

  const groups: DisplayGroup[] = [];
  for (const s of parents) {
    const children = (childrenBySpec.get(s) ?? [])
      .slice()
      .sort((a, b) => b.created - a.created);
    if (s.onMain && children.length === 0) continue;
    const updated = children.reduce((m, c) => Math.max(m, c.updated), s.updated);
    groups.push({ parent: s, children, created: s.created, updated });
  }
  for (const p of standalonePlans) groups.push(soloGroup(p));
  for (const o of others) groups.push(soloGroup(o));

  groups.sort(byCreatedDesc);
  return groups;
}
