export interface SpecEntry {
  /** absolute path on disk */
  path: string;
  /** basename, e.g. 2026-06-22-foo-design.md */
  filename: string;
  /** YYYY-MM-DD prefix (or full prefix) for display */
  date: string;
  /** worktree name if this spec exists ONLY in a worktree, else null */
  worktree: string | null;
}

export interface ProjectGroup {
  project: string;
  specs: SpecEntry[];
}
