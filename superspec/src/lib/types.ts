export interface SpecEntry {
  /** absolute path on disk */
  path: string;
  /** basename, e.g. 2026-06-22-foo-design.md */
  filename: string;
  /** first markdown heading (stripped) / first non-empty line / filename */
  title: string;
  /** project directory name */
  project: string;
  /** worktree name if this file exists ONLY in a worktree, else null */
  worktree: string | null;
  /** display label for the superpowers subdir: 'spec' | 'plan' | raw subdir name */
  type: string;
  /** file mtime in ms */
  mtime: number;
  /** max(mtime, filename-date-ms) — for ordering and the 24h window only */
  recency: number;
}

export interface ProjectGroup {
  project: string;
  specs: SpecEntry[];
}
