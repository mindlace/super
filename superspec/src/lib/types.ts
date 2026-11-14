export interface SpecEntry {
  /** absolute path on disk */
  path: string;
  /** basename, e.g. 2026-06-22-foo-design.md or .html */
  filename: string;
  /** first markdown heading / first non-empty line, or an HTML spec's first h1; else filename */
  title: string;
  /** project directory name */
  project: string;
  /** worktree name if this file exists ONLY in a worktree, else null */
  worktree: string | null;
  /** true if re-surfaced from the project's main checkout (otherwise main files are hidden) */
  onMain?: boolean;
  /** display label for the superpowers subdir: 'spec' | 'plan' | raw subdir name */
  type: string;
  /** file mtime in ms */
  mtime: number;
  /** when the doc first appeared (git first-add time; birthtime/mtime fallbacks), ms */
  created: number;
  /** when the doc last changed (git last-touch time, or mtime when edited/unknown), ms */
  updated: number;
}

