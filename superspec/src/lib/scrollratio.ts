export interface Scrollable {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** How far through its scrollable range `el` is, 0..1 (0 when it can't scroll). */
export function scrollRatio(el: Scrollable): number {
  const max = el.scrollHeight - el.clientHeight;
  return max <= 0 ? 0 : el.scrollTop / max;
}

/** The scrollTop that puts `el` at `ratio` of its scrollable range. */
export function scrollTopFor(ratio: number, el: Scrollable): number {
  const max = el.scrollHeight - el.clientHeight;
  return max <= 0 ? 0 : ratio * max;
}
