<script lang="ts">
  import type { SidebarEntry } from '$lib/sidebar';

  let {
    entries,
    onSelect,
    onPick,
    onClose
  }: {
    entries: SidebarEntry[];
    onSelect: (path: string) => void;
    onPick: (query: string) => Promise<boolean>;
    onClose: (path: string) => void;
  } = $props();

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
    const ok = await onPick(value);
    query = '';
    if (!ok) triggerShake();
  }
</script>

<aside
  class="flex h-full w-72 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950 text-sm"
>
  <label class="block shrink-0 border-b border-neutral-800 px-3 py-2">
    <span class="block leading-snug text-neutral-400">choose a doc</span>
    <input
      class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs
        text-neutral-200 placeholder:text-neutral-600 focus:border-blue-500 focus:outline-none
        {shaking ? 'shake' : ''}"
      placeholder="doc name or path"
      bind:value={query}
      onkeydown={onKey}
    />
  </label>
  <nav class="min-h-0 flex-1 overflow-y-auto">
    {#each entries as entry (entry.path)}
      <div
        class="border-b border-l-2 border-b-neutral-900 px-3 py-2
          {entry.highlighted ? 'border-l-blue-500' : 'border-l-transparent'}
          {entry.active ? 'bg-neutral-800' : ''}"
      >
        <div class="flex min-w-0 items-start gap-1.5">
          <button
            type="button"
            aria-current={entry.active ? 'page' : undefined}
            class="line-clamp-2 min-w-0 flex-1 text-left leading-snug
              {entry.active ? 'text-blue-200' : 'text-neutral-300 hover:text-neutral-100'}"
            onclick={() => onSelect(entry.path)}
            title={entry.title}
          >
            {#if entry.highlighted}
              <span
                class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 align-middle"
                aria-label="Updated"
              ></span>
            {/if}{entry.title}
          </button>
          <button
            type="button"
            aria-label="Close"
            class="shrink-0 text-neutral-500 hover:text-neutral-200"
            onclick={() => onClose(entry.path)}
          >×</button>
        </div>
        <div class="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
          <span class="text-xs text-neutral-500" title={entry.caption}>{entry.caption}</span>
          {#each entry.plans as plan (plan.path)}
            <button
              type="button"
              class="text-xs text-blue-400 hover:text-blue-300
                {plan.boxed ? 'rounded border border-blue-500 px-1.5 text-blue-300' : 'underline'}"
              onclick={() => onSelect(plan.path)}
            >{plan.label}</button>
          {/each}
        </div>
      </div>
    {/each}
  </nav>
</aside>
