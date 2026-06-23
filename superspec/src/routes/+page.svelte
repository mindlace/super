<script lang="ts">
  import { onMount } from 'svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Editor from '$lib/components/Editor.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import type { SpecEntry } from '$lib/types';
  import { DAY_MS } from '$lib/recency';
  import { pairAndGroup } from '$lib/pairing';

  let specs = $state<SpecEntry[]>([]);
  let selectedPath = $state<string | null>(null);
  let content = $state('');
  let knownMtime = $state(0);
  let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  const visibleGroups = $derived(
    pairAndGroup(specs).filter((g) => g.recency >= Date.now() - DAY_MS)
  );

  // Resizable sidebar
  const MIN_W = 220;
  const MAX_W = 600;
  const DEFAULT_W = 320;
  const STORAGE_KEY = 'sr:sidebarWidth';
  const SELECTED_KEY = 'sr:selectedPath';
  let sidebarWidth = $state(DEFAULT_W);
  let resizing = false;

  function startResize(e: PointerEvent) {
    resizing = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onResizeMove(e: PointerEvent) {
    if (!resizing) return;
    sidebarWidth = Math.min(MAX_W, Math.max(MIN_W, e.clientX));
  }
  function endResize(e: PointerEvent) {
    if (!resizing) return;
    resizing = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    localStorage.setItem(STORAGE_KEY, String(sidebarWidth));
  }

  async function loadSpecs() {
    const res = await fetch('/api/specs');
    if (!res.ok) return;
    specs = await res.json();
  }

  async function selectSpec(path: string): Promise<boolean> {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const res = await fetch(`/api/spec?path=${encodeURIComponent(path)}`);
    if (!res.ok) return false;
    const data = await res.json();
    content = data.content;
    knownMtime = data.mtime;
    selectedPath = path;
    saveStatus = 'idle';
    localStorage.setItem(SELECTED_KEY, path);
    return true;
  }

  async function save() {
    if (!selectedPath) return;
    const savedPath = selectedPath;
    saveStatus = 'saving';
    try {
      const res = await fetch(`/api/spec?path=${encodeURIComponent(savedPath)}`, {
        method: 'PUT',
        body: content
      });
      if (selectedPath !== savedPath) return;
      if (!res.ok) {
        saveStatus = 'error';
        return;
      }
      const data = await res.json();
      knownMtime = data.mtime;
      saveStatus = 'saved';
    } catch {
      if (selectedPath !== savedPath) return;
      saveStatus = 'error';
    }
  }

  function handleInput(value: string) {
    content = value;
    saveStatus = 'saving';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1000);
  }

  function showToast(message: string) {
    toast = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 3000);
  }

  async function pollExternalChange() {
    if (!selectedPath || saveStatus === 'saving') return;
    const polledPath = selectedPath;
    const res = await fetch(`/api/spec?path=${encodeURIComponent(polledPath)}`);
    if (!res.ok) return;
    if (selectedPath !== polledPath) return;
    const data = await res.json();
    if (data.mtime > knownMtime) {
      content = data.content;
      knownMtime = data.mtime;
      saveStatus = 'idle';
      showToast('Reloaded — file changed on disk');
    }
  }

  onMount(() => {
    const savedWidth = Number(localStorage.getItem(STORAGE_KEY));
    if (savedWidth >= MIN_W && savedWidth <= MAX_W) sidebarWidth = savedWidth;

    loadSpecs();

    const fromQuery = new URLSearchParams(window.location.search).get('path');
    const toOpen = fromQuery ?? localStorage.getItem(SELECTED_KEY);
    if (toOpen) {
      selectSpec(toOpen).then((ok) => {
        if (!ok && !fromQuery) localStorage.removeItem(SELECTED_KEY);
      });
    }

    const events = new EventSource('/api/events');
    events.onmessage = () => loadSpecs();

    const pollId = setInterval(pollExternalChange, 3000);

    return () => {
      clearInterval(pollId);
      events.close();
    };
  });
</script>

<div class="flex h-screen bg-neutral-900 text-neutral-200">
  <div class="shrink-0 overflow-hidden" style="width: {sidebarWidth}px">
    <Sidebar groups={visibleGroups} {selectedPath} onSelect={selectSpec} />
  </div>
  <div
    class="w-1 shrink-0 cursor-col-resize bg-neutral-800 hover:bg-neutral-600"
    role="separator"
    aria-orientation="vertical"
    onpointerdown={startResize}
    onpointermove={onResizeMove}
    onpointerup={endResize}
  ></div>
  <main class="flex min-w-0 flex-1 flex-col overflow-hidden">
    {#if selectedPath}
      <header class="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-xs">
        <span class="truncate text-neutral-500" title={selectedPath}>{selectedPath}</span>
        <span class="ml-2 shrink-0 text-neutral-500">
          {#if saveStatus === 'saving'}saving…{:else if saveStatus === 'saved'}saved{:else if saveStatus === 'error'}<span
              class="text-red-400">save failed</span
            >{/if}
        </span>
      </header>
      <div class="min-h-0 flex-1">
        <Editor {content} onInput={handleInput} />
      </div>
    {:else}
      <p class="p-6 text-neutral-500">Select a spec.</p>
    {/if}
  </main>
</div>
<Toast message={toast} />
