<script lang="ts">
  import type { SpecEntry } from '$lib/types';

  let {
    specs,
    selectedPath,
    onSelect
  }: {
    specs: SpecEntry[];
    selectedPath: string | null;
    onSelect: (path: string) => void;
  } = $props();

  function caption(s: SpecEntry): string {
    return [s.project, s.worktree, s.type].filter(Boolean).join(' · ');
  }
</script>

<nav class="h-full overflow-y-auto bg-neutral-950 p-2 text-sm">
  {#if specs.length === 0}
    <p class="p-2 text-neutral-500">No specs in the last 24 hours.</p>
  {/if}
  <ul>
    {#each specs as spec (spec.path)}
      <li>
        <button
          type="button"
          class="mb-1 block w-full rounded px-2 py-2 text-left hover:bg-neutral-800
            {selectedPath === spec.path ? 'bg-blue-950' : ''}"
          onclick={() => onSelect(spec.path)}
        >
          <span
            class="block break-words leading-snug
              {selectedPath === spec.path ? 'text-blue-200' : 'text-neutral-200'}"
            >{spec.title}</span
          >
          <span class="mt-0.5 block break-words text-xs text-neutral-500">{caption(spec)}</span>
        </button>
      </li>
    {/each}
  </ul>
</nav>
