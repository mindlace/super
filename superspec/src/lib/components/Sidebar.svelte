<script lang="ts">
  import type { ProjectGroup } from '$lib/types';

  let {
    groups,
    selectedPath,
    onSelect
  }: {
    groups: ProjectGroup[];
    selectedPath: string | null;
    onSelect: (path: string) => void;
  } = $props();
</script>

<nav class="h-full overflow-y-auto border-r border-neutral-800 bg-neutral-950 p-3 text-sm">
  {#if groups.length === 0}
    <p class="text-neutral-500">No specs found under ~/Projects.</p>
  {/if}
  {#each groups as group (group.project)}
    <section class="mb-4">
      <h2 class="mb-1 font-semibold text-neutral-300">{group.project}</h2>
      <ul>
        {#each group.specs as spec (spec.path)}
          <li>
            <button
              type="button"
              class="block w-full truncate rounded px-2 py-1 text-left hover:bg-neutral-800
                {selectedPath === spec.path ? 'bg-blue-950 text-blue-200' : 'text-neutral-400'}"
              title={spec.filename}
              onclick={() => onSelect(spec.path)}
            >
              {spec.filename}
              {#if spec.worktree}
                <span class="ml-1 rounded bg-amber-900 px-1 text-xs text-amber-100"
                  >{spec.worktree}</span
                >
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</nav>
