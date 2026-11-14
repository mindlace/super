/** The last render that landed (or failed), tagged with the file it was for. */
export type RenderOutcome<T> = { path: string; result: T } | { path: string; error: string };

export type RenderView<T> =
  | { status: 'pending' }
  | { status: 'ready'; result: T }
  | { status: 'error'; message: string };

/**
 * What the rendered pane may show for `path`. An outcome for any other file is
 * never shown: the pane stays empty until the selected file's first render
 * lands. For the same file, the last landed render stays up while a re-render
 * is pending.
 */
export function renderViewFor<T>(last: RenderOutcome<T> | null, path: string): RenderView<T> {
  if (!last || last.path !== path) return { status: 'pending' };
  if ('error' in last) return { status: 'error', message: last.error };
  return { status: 'ready', result: last.result };
}
