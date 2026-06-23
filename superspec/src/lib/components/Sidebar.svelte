<script lang="ts">
  import type { SpecEntry } from '$lib/types';
  import type { DisplayGroup } from '$lib/pairing';

  let {
    groups,
    selectedPath,
    onSelect
  }: {
    groups: DisplayGroup[];
    selectedPath: string | null;
    onSelect: (path: string) => void;
  } = $props();

  function caption(s: SpecEntry): string {
    return [s.project, s.worktree, s.type].filter(Boolean).join(' · ');
  }
</script>

<nav class="h-full overflow-y-auto bg-neutral-950 p-2 text-sm">
  {#if groups.length === 0}
    <p class="p-2 text-neutral-500">No specs in the last 24 hours.</p>
  {/if}
  <ul>
    {#each groups as group (group.parent.path)}
      <li>
        <button
          type="button"
          class="mb-1 block w-full rounded px-2 py-2 text-left hover:bg-neutral-800
            {selectedPath === group.parent.path ? 'bg-blue-950' : ''}"
          onclick={() => onSelect(group.parent.path)}
        >
          <span
            class="block break-words leading-snug
              {selectedPath === group.parent.path ? 'text-blue-200' : 'text-neutral-200'}"
            >{group.parent.title}</span
          >
          <span class="mt-0.5 block break-words text-xs text-neutral-500"
            >{caption(group.parent)}</span
          >
        </button>
        {#if group.children.length > 0}
          <ul class="mb-1 ml-3 border-l border-neutral-800 pl-2">
            {#each group.children as child (child.path)}
              <li>
                <button
                  type="button"
                  class="mb-1 block w-full rounded px-2 py-1 text-left hover:bg-neutral-800
                    {selectedPath === child.path ? 'bg-blue-950' : ''}"
                  onclick={() => onSelect(child.path)}
                >
                  <span
                    class="block break-words leading-snug
                      {selectedPath === child.path ? 'text-blue-200' : 'text-neutral-300'}"
                    >{child.title}</span
                  >
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </li>
    {/each}
  </ul>
</nav>
