<script lang="ts">
  import type { DisplayGroup } from '$lib/pairing';
  import { buildTabs } from '$lib/tabs';

  let {
    groups,
    selectedPath,
    onSelect,
    onPick,
    onClose,
    openedPaths = new Set<string>()
  }: {
    groups: DisplayGroup[];
    selectedPath: string | null;
    onSelect: (path: string) => void;
    onPick?: (query: string) => Promise<boolean>;
    onClose?: (path: string) => void;
    openedPaths?: Set<string>;
  } = $props();

  const tabs = $derived(buildTabs(groups, selectedPath, openedPaths));

  let query = $state('');
  let shaking = $state(false);
  let shakeTimer: ReturnType<typeof setTimeout> | null = null;

  function triggerShake() {
    shaking = true;
    if (shakeTimer) clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => (shaking = false), 400);
  }

  async function onKey(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const value = query.trim();
    if (!value) return;
    const ok = (await onPick?.(value)) ?? false;
    query = '';
    if (!ok) triggerShake();
  }
</script>

<nav class="flex shrink-0 gap-1.5 bg-neutral-950 px-2 pt-2 text-sm">
  {#each tabs as tab (tab.path)}
    <div
      class="flex min-w-0 flex-col rounded-t-lg border border-b-0 px-3 py-2
        {tab.active ? 'border-neutral-700 bg-neutral-900' : 'border-neutral-800 bg-neutral-950'}"
    >
      <div class="flex min-w-0 items-start gap-1.5">
        <button
          type="button"
          aria-current={tab.active ? 'page' : undefined}
          class="block min-w-0 flex-1 truncate text-left leading-snug
            {tab.active ? 'text-blue-200' : 'text-neutral-300'}"
          onclick={() => onSelect(tab.path)}
          title={tab.title}
        >{tab.title}</button>
        {#if tab.closeable}
          <button
            type="button"
            aria-label="Close tab"
            class="shrink-0 text-neutral-500 hover:text-neutral-200"
            onclick={() => onClose?.(tab.path)}
          >×</button>
        {/if}
      </div>
      <div class="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <span class="text-xs text-neutral-500" title={tab.caption}>{tab.caption}</span>
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
    </div>
  {/each}

  <div
    class="flex shrink-0 flex-col rounded-t-lg border border-b-0 border-neutral-800 bg-neutral-950 px-3 py-2"
  >
    <span class="block leading-snug text-neutral-400">choose a doc</span>
    <input
      class="mt-1 w-44 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs
        text-neutral-200 placeholder:text-neutral-600 focus:border-blue-500 focus:outline-none
        {shaking ? 'shake' : ''}"
      placeholder="doc name or path"
      bind:value={query}
      onkeydown={onKey}
    />
  </div>
</nav>

<style>
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-5px); }
    40% { transform: translateX(5px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(3px); }
  }
  .shake {
    animation: shake 0.4s ease-in-out;
    border-color: rgb(248 113 113);
  }
</style>
