/**
 * Compute the smallest single contiguous change that turns `current` into
 * `incoming`, as a CodeMirror change spec. Finds the common prefix, then the
 * common suffix (without letting the two overlap), and replaces only the
 * differing middle. Identical inputs yield a no-op range.
 */
export function diffRange(
  current: string,
  incoming: string
): { from: number; to: number; insert: string } {
  let prefix = 0;
  const minLen = Math.min(current.length, incoming.length);
  while (prefix < minLen && current[prefix] === incoming[prefix]) prefix++;

  let suffix = 0;
  // Stop the suffix scan before it crosses into the already-matched prefix on
  // either string, so `from <= to` and the insert slice stays well-formed.
  while (
    suffix < current.length - prefix &&
    suffix < incoming.length - prefix &&
    current[current.length - 1 - suffix] === incoming[incoming.length - 1 - suffix]
  ) {
    suffix++;
  }

  return {
    from: prefix,
    to: current.length - suffix,
    insert: incoming.slice(prefix, incoming.length - suffix)
  };
}
