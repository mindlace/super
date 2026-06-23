<script lang="ts">
  import type { DisplayGroup } from '$lib/pairing';
  import { buildTabs } from '$lib/tabs';

  let {
    groups,
    selectedPath,
    onSelect
  }: {
    groups: DisplayGroup[];
    selectedPath: string | null;
    onSelect: (path: string) => void;
  } = $props();

  const tabs = $derived(buildTabs(groups, selectedPath));
</script>

<nav class="flex shrink-0 gap-1.5 overflow-x-auto bg-neutral-950 px-2 pt-2 text-sm">
  {#each tabs as tab (tab.path)}
    <div
      class="min-w-[12rem] max-w-[15rem] shrink-0 rounded-t-lg border border-b-0 px-3 py-2
        {tab.active ? 'border-neutral-700 bg-neutral-900' : 'border-neutral-800 bg-neutral-950'}"
    >
      <button
        type="button"
        class="block w-full break-words text-left leading-snug
          {tab.active ? 'text-blue-200' : 'text-neutral-300'}"
        onclick={() => onSelect(tab.path)}
      >{tab.title}</button>
      <span class="mt-1 block break-words text-xs text-neutral-500">{tab.caption}</span>
      {#if tab.plans.length > 0}
        <div class="mt-1.5 flex flex-wrap gap-1.5">
          {#each tab.plans as plan (plan.path)}
            <button
              type="button"
              class="text-xs text-blue-400 hover:text-blue-300
                {plan.boxed
                  ? 'rounded border border-blue-500 px-1.5 text-blue-300'
                  : 'underline'}"
              onclick={() => onSelect(plan.path)}
            >{plan.label}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</nav>
