import type { SpecEntry } from '$lib/types';
import { stripSpecExt } from './specfile';

export interface DisplayGroup {
  parent: SpecEntry;
  children: SpecEntry[];
  recency: number;
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
    if (!cur || e.recency > cur.recency) map.set(k, e);
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
      .sort((a, b) => b.recency - a.recency);
    if (s.onMain && children.length === 0) continue;
    const recency = children.reduce((m, c) => Math.max(m, c.recency), s.recency);
    groups.push({ parent: s, children, recency });
  }
  for (const p of standalonePlans) groups.push({ parent: p, children: [], recency: p.recency });
  for (const o of others) groups.push({ parent: o, children: [], recency: o.recency });

  groups.sort((a, b) => b.recency - a.recency);
  return groups;
}
